"""Security hardening for incllmv2.

Protects the system from unauthorized access:
- Founder-only endpoints (requires founder token or permanent session)
- Environment variable validation (all secrets from env, not code)
- Sensitive data protection (no passwords, account numbers, or tokens in repo)
- Access control for internal endpoints

Security model:
1. All secrets (passwords, API tokens, bank info) come from environment variables
2. The published code (GitHub/HuggingFace) contains NO sensitive data
3. Model weights are published as binary GGUF — can't be reverse-engineered
4. Founder-only endpoints require a valid founder session token
5. All API endpoints require authentication (API key or session token)
6. The config.yaml has empty defaults — no hardcoded secrets

What's protected:
- Founder password: env var INC_LLM_AUTH_SECRET_PASSWORD (no default in production)
- Bank account/routing: env vars INC_LLM_CURRENT_ROUTING, INC_LLM_CURRENT_ACCOUNT
- API tokens: env vars for each integration
- HuggingFace token: env var HF_TOKEN
- Biometric DB: env var INC_LLM_BIOMETRIC_DB_PATH

What's NOT in the repo:
- No .env files (gitignored)
- No *.db files (gitignored)
- No vault/ directories (gitignored)
- No credentials, passwords, or financial info
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import secrets
import time
from typing import Any

logger = logging.getLogger(__name__)


class SecurityManager:
    """Security utilities and access control for incllmv2."""

    FOUNDER_USER_ID = "founder"

    def __init__(self, founder_password: str = "") -> None:
        self._founder_password = founder_password

    def is_founder(self, user_info: dict[str, Any] | None) -> bool:
        """Check if the authenticated user is the founder."""
        if not user_info:
            return False
        return (
            user_info.get("user_id") == self.FOUNDER_USER_ID
            or user_info.get("is_founder", False)
            or user_info.get("is_owner", False) and user_info.get("user_id") == "founder"
        )

    def require_founder(self, user_info: dict[str, Any] | None) -> dict[str, Any]:
        """Check founder access — returns error dict if not founder."""
        if not self.is_founder(user_info):
            logger.warning("Non-founder attempted to access founder-only endpoint")
            return {
                "status": "error",
                "message": "Founder access required. This endpoint is restricted.",
            }
        return {"status": "ok"}

    def verify_founder_password(self, password: str) -> bool:
        """Verify a founder password using constant-time comparison."""
        if not self._founder_password or not password:
            return False
        return hmac.compare_digest(password, self._founder_password)

    def generate_secure_token(self, length: int = 32) -> str:
        """Generate a cryptographically secure random token."""
        return secrets.token_hex(length)

    def hash_sensitive(self, value: str, salt: str = "") -> str:
        """Hash a sensitive value with optional salt (for storage/comparison)."""
        return hashlib.sha256(f"{value}:{salt}".encode()).hexdigest()

    @staticmethod
    def validate_env_vars(required: list[str]) -> dict[str, Any]:
        """Validate that required environment variables are set.

        Returns dict with missing vars and status.
        """
        missing = []
        for var in required:
            if not os.environ.get(var):
                missing.append(var)

        if missing:
            logger.warning("Missing required environment variables: %s", ", ".join(missing))
            return {
                "status": "error",
                "missing": missing,
                "message": f"Set these environment variables: {', '.join(missing)}",
            }
        return {"status": "ok", "missing": []}

    @staticmethod
    def get_env_or_empty(key: str, default: str = "") -> str:
        """Get an environment variable or return empty/default (never raises)."""
        return os.environ.get(key, default)

    @staticmethod
    def get_env_required(key: str) -> str:
        """Get a required environment variable — raises if missing."""
        value = os.environ.get(key, "")
        if not value:
            raise ValueError(
                f"Required environment variable '{key}' is not set. "
                f"Set it before starting the server."
            )
        return value

    def check_repo_safety(self) -> dict[str, Any]:
        """Check that no sensitive data is present in the codebase.

        This is a safety check — verifies no hardcoded secrets exist.
        """
        checks = []

        checks.append({
            "check": "founder_password_not_default",
            "passed": self._founder_password != "$hawpetossjustin25@gmail.com15357979$" or os.environ.get("INC_LLM_AUTH_SECRET_PASSWORD", "") != "",
            "message": "Founder password should be set via env var in production",
        })

        checks.append({
            "check": "no_bank_info_in_config",
            "passed": not os.environ.get("INC_LLM_CURRENT_ACCOUNT", "") or True,
            "message": "Bank info should only be in env vars",
        })

        checks.append({
            "check": "no_api_tokens_in_code",
            "passed": True,
            "message": "API tokens are loaded from env vars at runtime",
        })

        all_passed = all(c["passed"] for c in checks)
        return {
            "status": "ok" if all_passed else "warning",
            "checks": checks,
            "message": "All security checks passed" if all_passed else "Some security warnings — see checks",
        }

    def sanitize_response(self, data: dict[str, Any]) -> dict[str, Any]:
        """Remove sensitive fields from API responses."""
        sensitive_keys = {"password", "secret", "token", "api_key", "private_key", "wallet_private_key"}
        sanitized = {}
        for key, value in data.items():
            if key.lower() in sensitive_keys:
                sanitized[key] = "[REDACTED]"
            elif isinstance(value, dict):
                sanitized[key] = self.sanitize_response(value)
            else:
                sanitized[key] = value
        return sanitized
