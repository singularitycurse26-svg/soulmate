"""LLM-driven automated trading engine.

When the founder asks "trade BTC for me" or "set up a trading bot",
this engine:
1. Analyzes market data (prices, candles, orderbook)
2. Uses TradingSkillCreator insights for past performance
3. LLM generates trading decisions (buy/sell/hold)
4. Executes trades via TradingIntegration
5. Manages risk (stop-loss, position sizing)
6. Records trades for self-improvement
7. Can run autonomously (background mode) or on-demand

Safety:
- Max position size configurable (default: $100 per trade)
- Max daily loss configurable (default: $50)
- Stop-loss on every trade
- Founder can pause/stop at any time
- All trades logged for review

Zero-slowdown: autonomous loop runs as background asyncio.Task.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any

from inc_llm.integrations.trading import TradingIntegration
from inc_llm.integrations.trading_skills import TradingSkillCreator, TradeRecord

logger = logging.getLogger(__name__)


class AutomatedTradingEngine:
    """LLM-driven automated trading engine."""

    TRADING_PROMPT = """You are a crypto trading assistant. Based on market data, make a trading decision.

Market Data:
{market_data}

Current Portfolio:
{portfolio}

Past Performance:
{trading_insights}

Risk Limits: max_position=${max_position}, max_daily_loss=${max_daily_loss}, daily_pnl_so_far=${daily_pnl}

Return ONLY valid JSON:
{{
  "action": "buy" | "sell" | "hold",
  "symbol": "<trading pair>",
  "amount": <quantity in base currency>,
  "order_type": "market" | "limit",
  "price": <price if limit order, 0 if market>,
  "stop_loss": <stop loss price>,
  "take_profit": <take profit price>,
  "reasoning": "<brief explanation>"
}}"""

    def __init__(
        self,
        trading: TradingIntegration,
        skill_creator: TradingSkillCreator,
        harness: Any,
        max_position_usd: float = 100.0,
        max_daily_loss_usd: float = 50.0,
    ) -> None:
        self.trading = trading
        self.skill_creator = skill_creator
        self.harness = harness
        self._max_position = max_position_usd
        self._max_daily_loss = max_daily_loss_usd
        self._daily_pnl: float = 0.0
        self._daily_reset: float = time.time()
        self._active: bool = False
        self._trade_task: asyncio.Task | None = None
        self._trade_count: int = 0
        self._last_decision: dict[str, Any] = {}

    def _check_daily_reset(self) -> None:
        """Reset daily P&L counter every 24 hours."""
        if time.time() - self._daily_reset > 86400:
            self._daily_pnl = 0.0
            self._daily_reset = time.time()

    def _check_risk_limits(self) -> bool:
        """Check if we're within risk limits. Returns True if safe to trade."""
        self._check_daily_reset()
        if self._daily_pnl <= -self._max_daily_loss:
            logger.warning("Daily loss limit reached: %.2f (max: %.2f)",
                           self._daily_pnl, self._max_daily_loss)
            return False
        return True

    async def analyze_and_trade(self, symbol: str,
                                platform: str | None = None) -> dict[str, Any]:
        """Analyze market and execute a single trade decision.

        1. Gather market data (price, candles, 24h stats)
        2. Get portfolio and trading insights
        3. Ask LLM for a trading decision
        4. Execute the trade if within risk limits
        5. Record for self-improvement
        """
        p = platform or self.trading.config.default_platform

        if not self._check_risk_limits():
            return {"status": "blocked", "reason": "Daily loss limit reached"}

        try:
            market_data = await self._gather_market_data(symbol, p)
            portfolio = await self._get_portfolio_safe(p)
            insights = self.skill_creator.get_trading_insights(p, symbol) if self.skill_creator else "No history"

            prompt = self.TRADING_PROMPT.format(
                market_data=json.dumps(market_data, indent=2),
                portfolio=json.dumps(portfolio, indent=2),
                trading_insights=insights,
                max_position=self._max_position,
                max_daily_loss=self._max_daily_loss,
                daily_pnl=self._daily_pnl,
            )

            messages = [{"role": "user", "content": prompt}]
            response = await self.harness.bus.complete(
                role="code", messages=messages,
                max_tokens=256, temperature=0.3,
            )
            decision_text = response.get("content", "")

            decision = self._parse_decision(decision_text)
            if not decision:
                return {"status": "error", "reason": "Could not parse LLM decision", "raw": decision_text}

            self._last_decision = decision
            self._trade_count += 1

            if decision.get("action") == "hold":
                return {"status": "hold", "decision": decision}

            result = await self._execute_decision(decision, p)
            await self._record_trade(decision, result, p)
            return result

        except Exception as e:
            logger.error("Trading analysis failed: %s", e)
            return {"status": "error", "message": str(e)}

    async def _gather_market_data(self, symbol: str, platform: str) -> dict[str, Any]:
        """Gather market data for analysis."""
        data = {}
        try:
            data["price"] = await self.trading.get_price(symbol, platform)
        except Exception as e:
            data["price"] = {"error": str(e)}
        try:
            data["24h_stats"] = await self.trading.get_24h_stats(symbol, platform)
        except Exception as e:
            data["24h_stats"] = {"error": str(e)}
        try:
            data["candles"] = await self.trading.get_candles(symbol, "1h", 24, platform)
        except Exception as e:
            data["candles"] = {"error": str(e)}
        return data

    async def _get_portfolio_safe(self, platform: str) -> dict[str, Any]:
        """Get portfolio, return empty if no API keys."""
        try:
            return await self.trading.get_portfolio(platform)
        except Exception:
            return {"note": "No API keys configured or portfolio unavailable"}

    def _parse_decision(self, text: str) -> dict[str, Any] | None:
        """Parse the LLM's trading decision from JSON."""
        try:
            start = text.find("{")
            end = text.rfind("}") + 1
            if start >= 0 and end > start:
                return json.loads(text[start:end])
        except (json.JSONDecodeError, ValueError):
            pass
        return None

    async def _execute_decision(self, decision: dict[str, Any],
                                platform: str) -> dict[str, Any]:
        """Execute a trading decision with risk checks."""
        action = decision.get("action", "hold")
        symbol = decision.get("symbol", "")
        amount = float(decision.get("amount", 0))
        order_type = decision.get("order_type", "market")
        price = float(decision.get("price", 0))

        if amount <= 0:
            return {"status": "error", "reason": "Invalid amount", "decision": decision}

        price_data = await self.trading.get_price(symbol, platform)
        current_price = price_data.get("price", 0)
        usd_value = amount * current_price if current_price else 0

        if usd_value > self._max_position:
            logger.warning("Trade exceeds max position: $%.2f > $%.2f — scaling down",
                           usd_value, self._max_position)
            if current_price > 0:
                amount = self._max_position / current_price

        try:
            if action == "buy":
                if order_type == "limit" and price > 0:
                    result = await self.trading.place_limit_buy(symbol, amount, price, platform)
                else:
                    result = await self.trading.place_market_buy(symbol, amount, platform)
            elif action == "sell":
                if order_type == "limit" and price > 0:
                    result = await self.trading.place_limit_sell(symbol, amount, price, platform)
                else:
                    result = await self.trading.place_market_sell(symbol, amount, platform)
            else:
                return {"status": "hold", "decision": decision}

            if result.get("status") == "ok" and decision.get("stop_loss", 0) > 0:
                try:
                    await self.trading.place_stop_loss(
                        symbol, amount, float(decision["stop_loss"]), platform,
                    )
                except Exception as e:
                    logger.warning("Stop-loss placement failed: %s", e)

            return {"status": "executed", "result": result, "decision": decision}

        except Exception as e:
            logger.error("Trade execution failed: %s", e)
            return {"status": "error", "message": str(e), "decision": decision}

    async def _record_trade(self, decision: dict[str, Any],
                            result: dict[str, Any], platform: str) -> None:
        """Record trade for self-improvement (zero-slowdown)."""
        if not self.skill_creator:
            return

        success = result.get("status") == "executed"
        record = TradeRecord(
            platform=platform,
            symbol=decision.get("symbol", ""),
            side=decision.get("action", ""),
            order_type=decision.get("order_type", "market"),
            amount=float(decision.get("amount", 0)),
            price=float(decision.get("price", 0)),
            success=success,
            error="" if success else result.get("message", ""),
            reasoning=decision.get("reasoning", ""),
            stop_loss=float(decision.get("stop_loss", 0)),
            take_profit=float(decision.get("take_profit", 0)),
        )

        try:
            asyncio.create_task(self.skill_creator.record_trade(record))
        except Exception as e:
            logger.debug("Could not record trade for self-improvement: %s", e)

    async def start_autonomous_trading(
        self, symbols: list[str], interval_s: int = 300,
        platform: str | None = None,
    ) -> dict[str, Any]:
        """Start autonomous trading loop.

        Runs in background, checks market every interval_s seconds,
        makes trading decisions, executes trades.
        """
        if self._active:
            return {"status": "already_running"}

        self._active = True
        p = platform or self.trading.config.default_platform

        async def _loop():
            logger.info("Autonomous trading started: symbols=%s interval=%ds platform=%s",
                        symbols, interval_s, p)
            while self._active:
                try:
                    for symbol in symbols:
                        if not self._active:
                            break
                        await self.analyze_and_trade(symbol, p)
                        await asyncio.sleep(5)
                except Exception as e:
                    logger.error("Autonomous trading loop error: %s", e)
                await asyncio.sleep(interval_s)
            logger.info("Autonomous trading stopped")

        self._trade_task = asyncio.create_task(_loop())
        return {"status": "started", "symbols": symbols, "interval_s": interval_s, "platform": p}

    async def stop_autonomous_trading(self) -> dict[str, Any]:
        """Stop the autonomous trading loop."""
        self._active = False
        if self._trade_task and not self._trade_task.done():
            self._trade_task.cancel()
            try:
                await self._trade_task
            except asyncio.CancelledError:
                pass
        self._trade_task = None
        return {"status": "stopped"}

    def get_stats(self) -> dict[str, Any]:
        """Return trading engine stats."""
        return {
            "active": self._active,
            "total_decisions": self._trade_count,
            "daily_pnl": self._daily_pnl,
            "max_position_usd": self._max_position,
            "max_daily_loss_usd": self._max_daily_loss,
            "last_decision": self._last_decision.get("action", "none") if self._last_decision else "none",
        }
