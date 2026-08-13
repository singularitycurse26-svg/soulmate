"""Payment processor — routes all payments through Soulmate OS wallet system.

All subscription payments for incllmv2 are routed to the founder's wallet
on the Soulmate OS platform (hawpetossjustin25@gmail.com). The Soulmate OS
incentives wallet API handles deposit verification, crypto transfers, and
wallet management.

Payment flow:
1. User requests to pay → INC-LLM fetches founder wallet address from Soulmate OS
2. User sends crypto (USDT/USDC/BNB/INC) to founder wallet, or pays via Soulmate OS wallet UI
3. INC-LLM creates a deposit record via Soulmate OS API
4. On confirmation, subscription is activated
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
import urllib.request
import urllib.error
import urllib.parse
from typing import Any

from inc_llm.config import PaymentConfig

logger = logging.getLogger(__name__)


class SoulmateWalletProcessor:
    """Processes payments through the Soulmate OS incentives wallet system.

    All payments are routed to the founder's wallet
    on the Soulmate OS platform. This class handles:
    - Fetching the founder's wallet address from the API
    - Creating deposit requests
    - Verifying payment status
    - Supporting crypto transfers (USDT, USDC, BNB, INC) on BSC
    """

    def __init__(self, config: PaymentConfig) -> None:
        self.config = config
        self._founder_wallet: str = ""
        self._wallet_fetched_at: float = 0.0
        self._cache_ttl_s: int = 3600  # refresh founder wallet every hour

    @property
    def api_base(self) -> str:
        return self.config.soulmate_api_url.rstrip("/")

    def _headers(self) -> dict[str, str]:
        return {
            "Content-Type": "application/json",
            "X-API-Token": self.config.soulmate_api_token,
        }

    async def get_founder_wallet(self) -> str:
        """Fetch the founder's BSC wallet address from Soulmate OS API.

        Caches the result for 1 hour to avoid repeated API calls.
        Falls back to config.founder_wallet_address if API is unavailable.
        """
        if self._founder_wallet and (time.time() - self._wallet_fetched_at) < self._cache_ttl_s:
            return self._founder_wallet

        if self.config.founder_wallet_address:
            self._founder_wallet = self.config.founder_wallet_address
            self._wallet_fetched_at = time.time()
            return self._founder_wallet

        try:
            wallet = await self._fetch_wallet_from_api()
            if wallet:
                self._founder_wallet = wallet
                self._wallet_fetched_at = time.time()
                logger.info("Fetched founder wallet: %s", wallet)
                return wallet
        except Exception as e:
            logger.error("Failed to fetch founder wallet from Soulmate OS: %s", e)

        return self._founder_wallet

    async def _fetch_wallet_from_api(self) -> str:
        """Query Soulmate OS API for the founder's wallet address."""
        url = f"{self.api_base}/v1/users/wallet?email={urllib.parse.quote(self.config.founder_email)}"

        def _do_request():
            req = urllib.request.Request(url, headers=self._headers(), method="GET")
            resp = urllib.request.urlopen(req, timeout=15)
            data = json.loads(resp.read().decode())
            return data.get("wallet_address", "")

        return await asyncio.to_thread(_do_request)

    async def create_deposit(self, user_id: str, amount: float, token: str = "USDT") -> dict[str, Any]:
        """Create a deposit request on Soulmate OS for the founder's wallet.

        This records a pending payment that the user needs to send crypto to.
        The deposit is credited to the founder's wallet address.
        """
        wallet = await self.get_founder_wallet()
        if not wallet:
            return {"status": "error", "message": "Could not determine founder wallet address"}

        deposit_id = hashlib.sha256(f"{user_id}:{amount}:{time.time()}".encode()).hexdigest()[:16]

        try:
            result = await self._post_deposit(deposit_id, user_id, wallet, amount, token)
            result["deposit_id"] = deposit_id
            result["founder_wallet"] = wallet
            result["token"] = token
            logger.info("Created deposit %s for user %s (%.2f %s to %s)",
                        deposit_id, user_id, amount, token, wallet[:10] + "...")
            return result
        except Exception as e:
            logger.error("Deposit creation failed: %s", e)
            return {
                "status": "pending",
                "deposit_id": deposit_id,
                "founder_wallet": wallet,
                "token": token,
                "amount": amount,
                "message": f"Send {amount} {token} to {wallet}. Payment will be verified manually.",
            }

    async def _post_deposit(self, deposit_id: str, user_id: str, wallet: str,
                            amount: float, token: str) -> dict[str, Any]:
        """Post deposit request to Soulmate OS API."""
        url = f"{self.api_base}/v1/wallet/deposit"
        payload = json.dumps({
            "deposit_id": deposit_id,
            "user_id": user_id,
            "wallet_address": wallet,
            "amount": amount,
            "token": token,
            "method": "crypto",
            "source": "incllmv2",
        }).encode()

        def _do_request():
            req = urllib.request.Request(url, data=payload, headers=self._headers(), method="POST")
            resp = urllib.request.urlopen(req, timeout=15)
            return json.loads(resp.read().decode())

        return await asyncio.to_thread(_do_request)

    async def verify_payment(self, deposit_id: str) -> dict[str, Any]:
        """Verify a payment by checking deposit status on Soulmate OS API.

        Returns:
            {"status": "confirmed", "amount": float, "tx_hash": str} on success
            {"status": "pending"} if still pending
            {"status": "not_found"} if deposit doesn't exist
        """
        try:
            result = await self._check_deposit_status(deposit_id)
            logger.info("Deposit %s status: %s", deposit_id, result.get("status"))
            return result
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return {"status": "not_found", "message": "Deposit not found"}
            logger.error("Deposit verification HTTP error: %s", e)
            return {"status": "error", "message": f"HTTP {e.code}: {e.reason}"}
        except Exception as e:
            logger.error("Deposit verification failed: %s", e)
            return {"status": "error", "message": str(e)}

    async def _check_deposit_status(self, deposit_id: str) -> dict[str, Any]:
        """Check deposit status from Soulmate OS API."""
        url = f"{self.api_base}/v1/wallet/deposit/{deposit_id}/status"

        def _do_request():
            req = urllib.request.Request(url, headers=self._headers(), method="GET")
            resp = urllib.request.urlopen(req, timeout=15)
            return json.loads(resp.read().decode())

        return await asyncio.to_thread(_do_request)

    async def get_payment_instructions(self, user_id: str) -> dict[str, Any]:
        """Get payment instructions for a user to pay their subscription.

        Returns the founder's wallet address and accepted tokens so the user
        can send crypto directly, plus a link to the Soulmate OS wallet page
        for Google Pay / card payments.
        """
        wallet = await self.get_founder_wallet()
        return {
            "amount": self.config.price_monthly,
            "currency": self.config.currency,
            "period": "monthly",
            "founder_wallet": wallet,
            "accepted_tokens": self.config.accepted_tokens,
            "network": "BSC (Binance Smart Chain)",
            "soulmate_wallet_url": f"{self.api_base}/#/wallet",
            "instructions": (
                f"Send ${self.config.price_monthly} worth of "
                f"{', '.join(self.config.accepted_tokens)} to wallet address: {wallet} on BSC. "
                f"Or pay via Soulmate OS wallet at {self.api_base}/#/wallet "
                f"(Google Pay / card supported)."
            ),
        }


# Backward-compatible alias
PaymentProcessor = SoulmateWalletProcessor
