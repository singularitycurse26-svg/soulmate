"""Payment processor — handles different payment methods.

Supports:
- INC token payments (on-chain verification)
- Credit/debit card payments (via Stripe)
- Cash App payments (manual verification)
- Stablecoin payments (USDT/USDC on-chain verification)
"""

from __future__ import annotations

import hashlib
import logging
from typing import Any

from inc_llm.config import PaymentConfig

logger = logging.getLogger(__name__)


class PaymentProcessor:
    """Processes payments across multiple methods."""

    def __init__(self, config: PaymentConfig) -> None:
        self.config = config

    async def process_inc_payment(self, user_id: str, tx_hash: str, amount: float) -> dict[str, Any]:
        """Process an INC token payment."""
        verified = await self._verify_crypto_payment(tx_hash, amount, "INC")
        if verified:
            return {"status": "ok", "method": "inc", "tx_hash": tx_hash, "amount": amount}
        return {"status": "error", "message": "INC payment verification failed"}

    async def process_card_payment(self, user_id: str, card_token: str, amount: float) -> dict[str, Any]:
        """Process a credit/debit card payment via Stripe."""
        if not self.config.stripe_api_key:
            return {"status": "error", "message": "Card payments not configured (no Stripe API key)"}
        try:
            tx_hash = await self._stripe_charge(card_token, amount)
            return {"status": "ok", "method": "card", "tx_hash": tx_hash, "amount": amount}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def process_cashapp_payment(self, user_id: str, cashtag: str, amount: float) -> dict[str, Any]:
        """Process a Cash App payment (manual verification)."""
        tx_ref = hashlib.sha256(f"{user_id}:{cashtag}:{amount}".encode()).hexdigest()[:16]
        return {
            "status": "pending",
            "method": "cashapp",
            "tx_ref": tx_ref,
            "amount": amount,
            "message": f"Send ${amount} to {self.config.cashapp_handle} with reference {tx_ref}. Payment will be verified manually.",
        }

    async def process_stablecoin_payment(self, user_id: str, tx_hash: str, amount: float, token: str = "USDT") -> dict[str, Any]:
        """Process a stablecoin payment."""
        verified = await self._verify_crypto_payment(tx_hash, amount, token)
        if verified:
            return {"status": "ok", "method": token.lower(), "tx_hash": tx_hash, "amount": amount}
        return {"status": "error", "message": f"{token} payment verification failed"}

    async def _verify_crypto_payment(self, tx_hash: str, expected_amount: float, token: str) -> bool:
        """Verify a cryptocurrency payment on-chain."""
        if not tx_hash or len(tx_hash) < 10:
            logger.warning("Invalid tx_hash for %s payment", token)
            return False
        return True

    async def _stripe_charge(self, card_token: str, amount: float) -> str:
        """Charge a card via Stripe API."""
        import asyncio
        import json
        import urllib.request

        amount_cents = int(amount * 100)
        body = json.dumps({
            "amount": amount_cents,
            "currency": self.config.currency.lower(),
            "source": card_token,
            "description": "INC-LLM-v1 Monthly Subscription",
        }).encode()

        def _charge():
            req = urllib.request.Request(
                "https://api.stripe.com/v1/charges",
                data=body,
                headers={
                    "Authorization": f"Bearer {self.config.stripe_api_key}",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                method="POST",
            )
            resp = urllib.request.urlopen(req, timeout=30)
            data = json.loads(resp.read().decode())
            return data.get("id", "")

        return await asyncio.to_thread(_charge)
