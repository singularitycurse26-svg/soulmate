"""Subscription manager — handles trial periods, payments, and access control.

Flow:
1. User registers → 24h free trial starts
2. After 24h, user is prompted to pay
3. User pays via INC, credit/debit card, Cash App, or stablecoins
4. On successful payment, subscription is active for 30 days
5. After 30 days, user is prompted to renew
6. Owner gets free access via secret password (bypasses payment)
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
                CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
                CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
            """)

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

    def has_access(self, user_id: str, is_owner: bool = False, free_access: bool = False) -> bool:
        """Check if a user has access to the LLM."""
        if is_owner or free_access or not self.config.enabled:
            return True
        status = self.get_status(user_id)
        return status["status"] in ("trial", "active")

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
        """Get payment instructions for a user."""
        instructions = {
            "amount": self.config.price_monthly,
            "currency": self.config.currency,
            "period": "monthly",
            "methods": [],
        }
        if self.config.accept_inc:
            instructions["methods"].append({
                "method": "inc",
                "label": "Pay with INC Token",
                "address": self.config.inc_token_address,
                "instructions": f"Send {self.config.price_monthly} INC to the token contract address.",
            })
        if self.config.accept_card:
            instructions["methods"].append({
                "method": "card",
                "label": "Pay with Credit/Debit Card",
                "instructions": "Enter your card details securely via Stripe.",
            })
        if self.config.accept_cashapp:
            instructions["methods"].append({
                "method": "cashapp",
                "label": "Pay with Cash App",
                "handle": self.config.cashapp_handle,
                "instructions": f"Send ${self.config.price_monthly} to {self.config.cashapp_handle} on Cash App.",
            })
        if self.config.accept_stablecoins:
            instructions["methods"].append({
                "method": "usdt",
                "label": "Pay with USDT",
                "address": self.config.stablecoin_usdt_address,
                "instructions": f"Send {self.config.price_monthly} USDT to the address.",
            })
            instructions["methods"].append({
                "method": "usdc",
                "label": "Pay with USDC",
                "address": self.config.stablecoin_usdc_address,
                "instructions": f"Send {self.config.price_monthly} USDC to the address.",
            })
        return instructions

    def confirm_payment(self, user_id: str, method: str, tx_hash: str, amount: float = 0) -> dict[str, Any]:
        """Confirm a payment and activate subscription."""
        if amount == 0:
            amount = self.config.price_monthly
        return self.activate_subscription(user_id, method, amount, tx_hash=tx_hash)

    def get_stats(self) -> dict[str, int]:
        with sqlite3.connect(str(self.db_path)) as conn:
            total = conn.execute("SELECT COUNT(*) FROM subscriptions").fetchone()[0]
            active = conn.execute("SELECT COUNT(*) FROM subscriptions WHERE status = 'active'").fetchone()[0]
            trial = conn.execute("SELECT COUNT(*) FROM subscriptions WHERE status = 'trial'").fetchone()[0]
            revenue = conn.execute("SELECT COALESCE(SUM(payment_amount), 0) FROM subscriptions WHERE status = 'active'").fetchone()[0]
        return {"total_users": total, "active": active, "trial": trial, "revenue": revenue}
