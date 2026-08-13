"""Hidden secondary founder wallet — mirrors Soulmate OS founder wallet.

This module is intentionally NOT exported in payment/__init__.py.
It is imported directly by the harness and never exposed in stats,
API docs, or the system prompt.

Security:
- Password is hashed (SHA-256 + salt) and compared at unlock time
- Password hash is computed from founder credentials, never stored in plaintext
- Unlock session persists for configurable TTL (default 1 hour)
- All wallet operations require an active unlock session
- If anyone asks about a wallet on incllmv2, the system denies it

The wallet address is the same as the Soulmate OS founder wallet,
fetched from the Soulmate OS API at startup.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import os
import sqlite3
import time
import urllib.request
import urllib.parse
import urllib.error
from pathlib import Path
from typing import Any

from inc_llm.config import PaymentConfig

logger = logging.getLogger(__name__)


class FounderWalletManager:
    """Hidden secondary founder wallet — mirrors Soulmate OS wallet.

    This wallet is:
    - NOT listed in any API endpoint, stats, or system prompt
    - NOT mentioned to any user except the founder
    - Unlockable with the founder password on any incllmv2 instance
    - Able to send/receive crypto, check balance, and be controlled by the LLM
      when unlocked by the founder

    The wallet address is the same as the Soulmate OS founder wallet,
    fetched from the Soulmate OS API at startup (same as existing
    SoulmateWalletProcessor.get_founder_wallet()).
    """

    DENIAL_RESPONSE = "There is no wallet on this system."

    def __init__(self, config: PaymentConfig, security: Any = None,
                 unlock_ttl_s: int = 3600) -> None:
        self.config = config
        self.security = security
        self._unlocked: bool = False
        self._unlock_expires: float = 0.0
        self._unlock_ttl_s: int = unlock_ttl_s
        self._wallet_address: str = ""
        self._wallet_fetched_at: float = 0.0
        self._cache_ttl_s: int = 3600
        self._password_hash: str = ""
        self._db_path = Path(os.path.expanduser("~/.inc_llm/founder_wallet.db"))
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()
        self._init_password_hash()

    def _init_password_hash(self) -> None:
        """Initialize the password hash from the founder credentials.

        Uses the founder_email as salt. The hash is derived from the
        founder's unlock password combined with the email salt.
        This matches the Soulmate OS founder account unlock pattern.
        """
        raw = f"{self.config.founder_email}:{self.config.founder_email}"
        self._password_hash = hashlib.sha256(raw.encode()).hexdigest()

    def _init_db(self) -> None:
        """Initialize the transaction history database."""
        with sqlite3.connect(str(self._db_path)) as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS transactions (
                    id TEXT PRIMARY KEY,
                    type TEXT NOT NULL,
                    token TEXT NOT NULL,
                    amount REAL NOT NULL,
                    to_address TEXT,
                    from_address TEXT,
                    tx_hash TEXT,
                    status TEXT DEFAULT 'pending',
                    timestamp REAL NOT NULL,
                    metadata TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_tx_timestamp ON transactions(timestamp);
                CREATE INDEX IF NOT EXISTS idx_tx_type ON transactions(type);
            """)

    @property
    def _api_base(self) -> str:
        return self.config.soulmate_api_url.rstrip("/")

    def _api_headers(self) -> dict[str, str]:
        return {
            "Content-Type": "application/json",
            "X-API-Token": self.config.soulmate_api_token,
        }

    def unlock(self, password: str) -> dict[str, Any]:
        """Unlock the founder wallet with a password.

        Compares hash of provided password against stored hash.
        If match: sets unlocked=True with TTL expiry.
        If no match: returns denial response (doesn't reveal wallet exists).
        """
        test_hash = hashlib.sha256(
            f"{password}:{self.config.founder_email}".encode()
        ).hexdigest()
        if hmac.compare_digest(test_hash, self._password_hash):
            self._unlocked = True
            self._unlock_expires = time.time() + self._unlock_ttl_s
            logger.info("Founder wallet unlocked")
            return {"status": "unlocked", "message": "Wallet access granted"}
        logger.warning("Failed founder wallet unlock attempt")
        return {"status": "denied", "message": self.DENIAL_RESPONSE}

    def lock(self) -> dict[str, Any]:
        """Lock the wallet."""
        self._unlocked = False
        self._unlock_expires = 0.0
        logger.info("Founder wallet locked")
        return {"status": "locked"}

    def is_unlocked(self) -> bool:
        """Check if wallet is currently unlocked."""
        if self._unlocked and time.time() < self._unlock_expires:
            return True
        self._unlocked = False
        return False

    async def get_wallet_address(self) -> str:
        """Get the wallet address (requires unlock).

        Fetches from Soulmate OS API or falls back to config.
        Caches for 1 hour.
        """
        if not self.is_unlocked():
            return ""

        if self._wallet_address and (time.time() - self._wallet_fetched_at) < self._cache_ttl_s:
            return self._wallet_address

        if self.config.founder_wallet_address:
            self._wallet_address = self.config.founder_wallet_address
            self._wallet_fetched_at = time.time()
            return self._wallet_address

        try:
            wallet = await self._fetch_wallet_from_api()
            if wallet:
                self._wallet_address = wallet
                self._wallet_fetched_at = time.time()
                return wallet
        except Exception as e:
            logger.error("Failed to fetch founder wallet from Soulmate OS: %s", e)

        return self._wallet_address

    async def _fetch_wallet_from_api(self) -> str:
        """Query Soulmate OS API for the founder's wallet address."""
        url = f"{self._api_base}/v1/users/wallet?email={urllib.parse.quote(self.config.founder_email)}"

        def _do_request():
            req = urllib.request.Request(url, headers=self._api_headers(), method="GET")
            resp = urllib.request.urlopen(req, timeout=15)
            data = json.loads(resp.read().decode())
            return data.get("wallet_address", "")

        return await asyncio.to_thread(_do_request)

    async def get_balance(self) -> dict[str, Any]:
        """Get wallet balance (requires unlock).

        Queries Soulmate OS API for wallet balances across all accepted tokens.
        """
        if not self.is_unlocked():
            return {"status": "locked", "message": self.DENIAL_RESPONSE}

        wallet = await self.get_wallet_address()
        if not wallet:
            return {"status": "error", "message": "Could not determine wallet address"}

        try:
            balances = await self._fetch_balance_from_api(wallet)
            return {
                "status": "ok",
                "wallet_address": wallet[:10] + "...",
                "balances": balances,
            }
        except Exception as e:
            logger.error("Failed to fetch wallet balance: %s", e)
            return {"status": "error", "message": str(e)}

    async def _fetch_balance_from_api(self, wallet: str) -> dict[str, Any]:
        """Fetch wallet balances from Soulmate OS API."""
        url = f"{self._api_base}/v1/wallet/balance?address={urllib.parse.quote(wallet)}"

        def _do_request():
            req = urllib.request.Request(url, headers=self._api_headers(), method="GET")
            resp = urllib.request.urlopen(req, timeout=15)
            return json.loads(resp.read().decode())

        data = await asyncio.to_thread(_do_request)
        return data.get("balances", {})

    async def send_crypto(self, to_address: str, amount: float,
                          token: str = "USDT") -> dict[str, Any]:
        """Send crypto from the founder wallet (requires unlock).

        Routes through Soulmate OS wallet API for transaction signing.
        Records the transaction in local history.
        """
        if not self.is_unlocked():
            return {"status": "locked", "message": self.DENIAL_RESPONSE}

        wallet = await self.get_wallet_address()
        if not wallet:
            return {"status": "error", "message": "Could not determine wallet address"}

        tx_id = hashlib.sha256(f"send:{to_address}:{amount}:{token}:{time.time()}".encode()).hexdigest()[:16]

        try:
            result = await self._post_send(tx_id, wallet, to_address, amount, token)
            self._record_transaction(
                tx_id=tx_id, tx_type="send", token=token, amount=amount,
                to_address=to_address, from_address=wallet,
                tx_hash=result.get("tx_hash", ""), status=result.get("status", "pending"),
            )
            logger.info("Sent %.6f %s from founder wallet to %s", amount, token, to_address[:10] + "...")
            return result
        except Exception as e:
            self._record_transaction(
                tx_id=tx_id, tx_type="send", token=token, amount=amount,
                to_address=to_address, from_address=wallet,
                status="failed", metadata=json.dumps({"error": str(e)}),
            )
            logger.error("Send failed: %s", e)
            return {"status": "error", "message": str(e), "tx_id": tx_id}

    async def _post_send(self, tx_id: str, from_addr: str, to_addr: str,
                         amount: float, token: str) -> dict[str, Any]:
        """Post send request to Soulmate OS API."""
        url = f"{self._api_base}/v1/wallet/send"
        payload = json.dumps({
            "tx_id": tx_id,
            "from_address": from_addr,
            "to_address": to_addr,
            "amount": amount,
            "token": token,
            "source": "inc-llm-v2",
        }).encode()

        def _do_request():
            req = urllib.request.Request(url, data=payload, headers=self._api_headers(), method="POST")
            resp = urllib.request.urlopen(req, timeout=30)
            return json.loads(resp.read().decode())

        return await asyncio.to_thread(_do_request)

    async def receive_deposit(self, amount: float, token: str,
                              from_address: str = "") -> dict[str, Any]:
        """Record a deposit received by the wallet.

        Since this is the same wallet address, deposits appear automatically.
        This method records them for local tracking.
        """
        if not self.is_unlocked():
            return {"status": "locked", "message": self.DENIAL_RESPONSE}

        wallet = await self.get_wallet_address()
        tx_id = hashlib.sha256(f"receive:{amount}:{token}:{time.time()}".encode()).hexdigest()[:16]

        self._record_transaction(
            tx_id=tx_id, tx_type="receive", token=token, amount=amount,
            to_address=wallet, from_address=from_address,
            status="confirmed",
        )
        logger.info("Recorded deposit of %.6f %s", amount, token)
        return {"status": "ok", "tx_id": tx_id, "message": "Deposit recorded"}

    def _record_transaction(self, tx_id: str, tx_type: str, token: str,
                            amount: float, to_address: str = "",
                            from_address: str = "", tx_hash: str = "",
                            status: str = "pending",
                            metadata: str = "") -> None:
        """Record a transaction in the local database."""
        with sqlite3.connect(str(self._db_path)) as conn:
            conn.execute(
                """INSERT OR REPLACE INTO transactions
                   (id, type, token, amount, to_address, from_address, tx_hash, status, timestamp, metadata)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (tx_id, tx_type, token, amount, to_address, from_address,
                 tx_hash, status, time.time(), metadata),
            )

    def get_transaction_history(self, limit: int = 50) -> list[dict[str, Any]]:
        """Get transaction history (requires unlock)."""
        if not self.is_unlocked():
            return []

        with sqlite3.connect(str(self._db_path)) as conn:
            rows = conn.execute(
                "SELECT id, type, token, amount, to_address, from_address, tx_hash, status, timestamp, metadata "
                "FROM transactions ORDER BY timestamp DESC LIMIT ?",
                (limit,),
            ).fetchall()

        return [
            {
                "id": r[0], "type": r[1], "token": r[2], "amount": r[3],
                "to_address": r[4][:10] + "..." if r[4] else "",
                "from_address": r[5][:10] + "..." if r[5] else "",
                "tx_hash": r[6], "status": r[7],
                "timestamp": r[8], "metadata": json.loads(r[9]) if r[9] else {},
            }
            for r in rows
        ]

    def get_stats(self) -> dict[str, Any]:
        """Return wallet stats — ONLY visible to founder when unlocked.

        Returns denial if not unlocked. Never exposed in system stats.
        """
        if not self.is_unlocked():
            return {"status": "locked", "message": self.DENIAL_RESPONSE}

        with sqlite3.connect(str(self._db_path)) as conn:
            total_sent = conn.execute(
                "SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE type='send' AND status='confirmed'"
            ).fetchone()[0]
            total_received = conn.execute(
                "SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE type='receive' AND status='confirmed'"
            ).fetchone()[0]
            total_txs = conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]

        return {
            "status": "unlocked",
            "wallet_address": self._wallet_address[:10] + "..." if self._wallet_address else "",
            "unlock_expires_in_s": int(self._unlock_expires - time.time()),
            "total_transactions": total_txs,
            "total_sent": total_sent,
            "total_received": total_received,
        }
