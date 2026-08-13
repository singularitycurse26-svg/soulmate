"""Subscription manager — handles trial periods, payments, and access control.

Flow:
1. User registers → free trial starts (configurable duration)
2. After trial, user is prompted to subscribe
3. User pays via Current ACH, Cash App, Google Pay, Kraken, or crypto
4. On successful payment, subscription is active for 30 days
5. After 30 days, user is prompted to renew
6. Founder gets permanent free access via password or fingerprint (bypasses payment)
7. Freemium tier: free users get limited requests/day, paid tiers get unlimited
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import time
from pathlib import Path
from typing import Any

from inc_llm.config import PaymentConfig

logger = logging.getLogger(__name__)


class SubscriptionManager:
    """Manages user subscriptions and access control."""

    def __init__(self, config: PaymentConfig) -> None:
        self.config = config
        self.db_path = Path(os.path.expanduser(config.db_path))
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _init_db(self) -> None:
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS subscriptions (
                    user_id TEXT PRIMARY KEY,
                    status TEXT NOT NULL DEFAULT 'trial',
                    trial_started REAL NOT NULL,
                    trial_ends REAL NOT NULL,
                    subscription_started REAL DEFAULT 0,
                    subscription_ends REAL DEFAULT 0,
                    payment_method TEXT,
                    payment_amount REAL DEFAULT 0,
                    payment_currency TEXT DEFAULT 'USD',
                    payment_tx_hash TEXT,
                    last_payment_at REAL DEFAULT 0,
                    payment_count INTEGER DEFAULT 0,
                    tier TEXT DEFAULT 'free',
                    metadata TEXT
                );
                CREATE TABLE IF NOT EXISTS payments (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    method TEXT NOT NULL,
                    amount REAL NOT NULL,
                    currency TEXT DEFAULT 'USD',
                    tx_hash TEXT,
                    status TEXT DEFAULT 'pending',
                    created_at REAL NOT NULL,
                    confirmed_at REAL DEFAULT 0,
                    metadata TEXT
                );
                CREATE TABLE IF NOT EXISTS daily_usage (
                    user_id TEXT NOT NULL,
                    day INTEGER NOT NULL,
                    request_count INTEGER DEFAULT 0,
                    PRIMARY KEY (user_id, day)
                );
                CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
                CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
                CREATE INDEX IF NOT EXISTS idx_daily_usage_user ON daily_usage(user_id);
            """)
            # Migration: add tier column if missing
            cursor = conn.execute("PRAGMA table_info(subscriptions)")
            columns = [row[1] for row in cursor.fetchall()]
            if "tier" not in columns:
                conn.execute("ALTER TABLE subscriptions ADD COLUMN tier TEXT DEFAULT 'free'")
                logger.info("Migration: added tier column to subscriptions")

    def start_trial(self, user_id: str) -> dict[str, Any]:
        """Start a free trial for a new user."""
        now = time.time()
        trial_ends = now + (self.config.trial_hours * 3600)
        with sqlite3.connect(str(self.db_path)) as conn:
            existing = conn.execute("SELECT 1 FROM subscriptions WHERE user_id = ?", (user_id,)).fetchone()
            if existing:
                return self.get_status(user_id)
            conn.execute(
                """INSERT INTO subscriptions
                   (user_id, status, trial_started, trial_ends, metadata)
                   VALUES (?, 'trial', ?, ?, ?)""",
                (user_id, now, trial_ends, json.dumps({})),
            )
        logger.info("Started trial for user %s (ends: %s)", user_id, trial_ends)
        return self.get_status(user_id)

    def get_status(self, user_id: str) -> dict[str, Any]:
        """Get subscription status for a user."""
        with sqlite3.connect(str(self.db_path)) as conn:
            row = conn.execute("SELECT * FROM subscriptions WHERE user_id = ?", (user_id,)).fetchone()
        if row is None:
            return {"status": "none", "message": "No subscription found. Start a trial first."}
        now = time.time()
        status = row[1]
        trial_ends = row[3]
        sub_ends = row[5]
        if status == "trial" and now > trial_ends:
            status = "expired_trial"
        elif status == "active" and now > sub_ends:
            status = "expired"
        return {
            "status": status,
            "trial_ends": trial_ends,
            "subscription_ends": sub_ends,
            "payment_method": row[6],
            "days_remaining": max(0, int((sub_ends - now) / 86400)) if sub_ends else 0,
            "trial_hours_remaining": max(0, int((trial_ends - now) / 3600)) if status == "trial" else 0,
        }

    # Freemium subscription tiers
    TIERS = {
        "free": {
            "price": 0.0,
            "requests_per_day": 50,
            "max_tokens": 64,
            "max_context": 512,
            "features": ["mobile_only", "community_support"],
        },
        "mobile_pro": {
            "price": 4.99,
            "requests_per_day": -1,  # unlimited
            "max_tokens": 128,
            "max_context": 1024,
            "features": ["all_devices", "priority_support"],
        },
        "desktop": {
            "price": 14.99,
            "requests_per_day": -1,
            "max_tokens": 512,
            "max_context": 4096,
            "features": ["api_access", "priority_support"],
        },
        "pro": {
            "price": 29.99,
            "requests_per_day": -1,
            "max_tokens": 1024,
            "max_context": 8192,
            "features": ["api_access", "webhooks", "priority_support"],
        },
        "enterprise": {
            "price": 199.0,
            "requests_per_day": -1,
            "max_tokens": 4096,
            "max_context": 32768,
            "features": ["custom_models", "SLA", "on_premise"],
        },
    }

    def has_access(self, user_id: str, is_owner: bool = False, free_access: bool = False) -> bool:
        """Check if a user has access to the LLM.

        Founder (user_id='founder') always has access — permanent free.
        """
        if is_owner or free_access or not self.config.enabled:
            return True
        if self._is_founder(user_id):
            return True
        status = self.get_status(user_id)
        return status["status"] in ("trial", "active")

    def _is_founder(self, user_id: str) -> bool:
        """Check if user_id is the founder (permanent free access)."""
        return user_id == "founder"

    def get_tier(self, user_id: str) -> str:
        """Get the subscription tier for a user."""
        if self._is_founder(user_id):
            return "enterprise"  # Founder gets enterprise-level access
        status = self.get_status(user_id)
        if status["status"] in ("trial",):
            return "free"
        if status["status"] == "active":
            return status.get("tier", "mobile_pro")
        return "free"

    def get_tier_limits(self, user_id: str) -> dict[str, Any]:
        """Get token, context, and request limits for a user's tier.

        Founder gets unlimited everything.
        """
        if self._is_founder(user_id):
            return {
                "tier": "founder",
                "requests_per_day": -1,
                "max_tokens": 4096,
                "max_context": 32768,
                "features": "all",
            }
        tier_name = self.get_tier(user_id)
        tier_info = self.TIERS.get(tier_name, self.TIERS["free"])
        return {"tier": tier_name, **tier_info}

    def check_request_limit(self, user_id: str) -> bool:
        """Check if user has remaining requests for today (freemium).

        Founder and paid tiers have unlimited requests.
        """
        if self._is_founder(user_id):
            return True
        limits = self.get_tier_limits(user_id)
        if limits["requests_per_day"] == -1:
            return True
        # Check daily request count
        today = int(time.time() / 86400)
        with sqlite3.connect(str(self.db_path)) as conn:
            row = conn.execute(
                "SELECT request_count FROM daily_usage WHERE user_id = ? AND day = ?",
                (user_id, today),
            ).fetchone()
            count = row[0] if row else 0
        return count < limits["requests_per_day"]

    def record_request(self, user_id: str) -> None:
        """Record a request for daily usage tracking (freemium)."""
        if self._is_founder(user_id):
            return
        today = int(time.time() / 86400)
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                "INSERT OR IGNORE INTO daily_usage (user_id, day, request_count) VALUES (?, ?, 0)",
                (user_id, today),
            )
            conn.execute(
                "UPDATE daily_usage SET request_count = request_count + 1 WHERE user_id = ? AND day = ?",
                (user_id, today),
            )

    def get_all_tiers(self) -> dict[str, dict[str, Any]]:
        """Get all subscription tiers (for display/payment endpoints)."""
        return dict(self.TIERS)

    def update_tier_pricing(self, tier_name: str, price: float) -> dict[str, Any]:
        """Update a tier's price (founder only — called from founder endpoints)."""
        if tier_name not in self.TIERS:
            return {"status": "error", "message": f"Unknown tier: {tier_name}"}
        self.TIERS[tier_name]["price"] = price
        logger.info("Updated tier %s price to $%.2f", tier_name, price)
        return {"status": "ok", "tier": tier_name, "new_price": price}

    def get_revenue_dashboard(self) -> dict[str, Any]:
        """Get revenue dashboard data (founder only)."""
        with sqlite3.connect(str(self.db_path)) as conn:
            total_revenue = conn.execute(
                "SELECT COALESCE(SUM(payment_amount), 0) FROM payments WHERE status = 'confirmed'"
            ).fetchone()[0]
            monthly_revenue = conn.execute(
                "SELECT COALESCE(SUM(payment_amount), 0) FROM payments "
                "WHERE status = 'confirmed' AND confirmed_at > ?",
                (time.time() - 30 * 86400,),
            ).fetchone()[0]
            tier_counts = {}
            for tier in self.TIERS:
                count = conn.execute(
                    "SELECT COUNT(*) FROM subscriptions WHERE status = 'active' AND tier = ?",
                    (tier,),
                ).fetchone()[0]
                tier_counts[tier] = count
            total_users = conn.execute("SELECT COUNT(*) FROM subscriptions").fetchone()[0]
            active_users = conn.execute(
                "SELECT COUNT(*) FROM subscriptions WHERE status = 'active'"
            ).fetchone()[0]
        return {
            "total_revenue": total_revenue,
            "monthly_revenue": monthly_revenue,
            "total_users": total_users,
            "active_users": active_users,
            "tier_counts": tier_counts,
            "tiers": self.get_all_tiers(),
        }

    def activate_subscription(self, user_id: str, method: str, amount: float,
                              currency: str = "USD", tx_hash: str = "") -> dict[str, Any]:
        """Activate a subscription after successful payment."""
        now = time.time()
        sub_ends = now + (30 * 86400)  # 30 days
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                """UPDATE subscriptions SET
                   status = 'active', subscription_started = ?, subscription_ends = ?,
                   payment_method = ?, payment_amount = ?, payment_currency = ?,
                   payment_tx_hash = ?, last_payment_at = ?, payment_count = payment_count + 1
                   WHERE user_id = ?""",
                (now, sub_ends, method, amount, currency, tx_hash, now, user_id),
            )
            payment_id = f"pay_{user_id}_{int(now)}"
            conn.execute(
                """INSERT OR REPLACE INTO payments
                   (id, user_id, method, amount, currency, tx_hash, status, created_at, confirmed_at)
                   VALUES (?, ?, ?, ?, ?, ?, 'confirmed', ?, ?)""",
                (payment_id, user_id, method, amount, currency, tx_hash, now, now),
            )
        logger.info("Activated subscription for user %s (method: %s, ends: %s)", user_id, method, sub_ends)
        return self.get_status(user_id)

    def get_payment_instructions(self, user_id: str) -> dict[str, Any]:
        """Get payment instructions for a user.

        All payments are routed through the Soulmate OS wallet system to the
        founder's wallet (hawpetossjustin25@gmail.com). Users can send crypto
        (USDT, USDC, BNB, INC) directly to the founder wallet on BSC, or pay
        via the Soulmate OS wallet UI (Google Pay / card).
        """
        return {
            "amount": self.config.price_monthly,
            "currency": self.config.currency,
            "period": "monthly",
            "founder_wallet": self.config.founder_wallet_address or "Fetch from Soulmate OS at runtime",
            "accepted_tokens": self.config.accepted_tokens,
            "network": "BSC (Binance Smart Chain)",
            "soulmate_wallet_url": f"{self.config.soulmate_api_url.rstrip('/')}/#/wallet",
            "instructions": (
                f"Send ${self.config.price_monthly} worth of "
                f"{', '.join(self.config.accepted_tokens)} to the founder wallet on BSC. "
                f"Or pay via Soulmate OS wallet at {self.config.soulmate_api_url.rstrip('/')}/#/wallet "
                f"(Google Pay / card supported). Payments are credited to "
                f"the founder's wallet on Soulmate OS."
            ),
        }

    def confirm_payment(self, user_id: str, method: str, tx_hash: str = "", amount: float = 0,
                        deposit_id: str = "") -> dict[str, Any]:
        """Confirm a payment and activate subscription.

        Args:
            user_id: The user paying
            method: Payment method (e.g. 'soulmate_wallet', 'USDT', 'USDC', 'BNB', 'INC')
            tx_hash: Transaction hash (for crypto payments)
            amount: Payment amount (defaults to price_monthly)
            deposit_id: Deposit ID from Soulmate OS (for verification)
        """
        if amount == 0:
            amount = self.config.price_monthly
        return self.activate_subscription(user_id, method, amount, tx_hash=tx_hash or deposit_id)

    def get_stats(self) -> dict[str, Any]:
        with sqlite3.connect(str(self.db_path)) as conn:
            total = conn.execute("SELECT COUNT(*) FROM subscriptions").fetchone()[0]
            active = conn.execute("SELECT COUNT(*) FROM subscriptions WHERE status = 'active'").fetchone()[0]
            trial = conn.execute("SELECT COUNT(*) FROM subscriptions WHERE status = 'trial'").fetchone()[0]
            revenue = conn.execute("SELECT COALESCE(SUM(payment_amount), 0) FROM subscriptions WHERE status = 'active'").fetchone()[0]
        return {"total_users": total, "active": active, "trial": trial, "revenue": revenue}
