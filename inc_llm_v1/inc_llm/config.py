"""Configuration system for INC-LLM-v1.

Supports YAML config files, environment variable overrides (INC_LLM_ prefix),
and hardware tier switching (minimal/standard/full).
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field, asdict
from enum import Enum
from pathlib import Path
from typing import Any

import yaml


class HardwareTier(str, Enum):
    MINIMAL = "minimal"
    STANDARD = "standard"
    FULL = "full"


class ProviderBackend(str, Enum):
    OLLAMA = "ollama"
    OPENAI_COMPATIBLE = "openai_compatible"


@dataclass
class ModelConfig:
    """Model role → model name mapping for the 5-model bus."""

    fast: str = "qwen2.5:0.5b"
    base: str = "qwen2.5:0.5b"
    judge: str = "qwen2.5:1.5b"
    code: str = "qwen2.5:1.5b"
    style: str = "qwen2.5:0.5b"

    @staticmethod
    def minimal() -> "ModelConfig":
        return ModelConfig(
            fast="qwen2.5:0.5b",
            base="qwen2.5:0.5b",
            judge="qwen2.5:0.5b",
            code="qwen2.5:0.5b",
            style="qwen2.5:0.5b",
        )

    @staticmethod
    def standard() -> "ModelConfig":
        return ModelConfig(
            fast="qwen2.5:0.5b",
            base="qwen2.5:1.5b",
            judge="qwen2.5:1.5b",
            code="qwen2.5:1.5b",
            style="qwen2.5:0.5b",
        )

    @staticmethod
    def full() -> "ModelConfig":
        return ModelConfig(
            fast="qwen2.5:0.5b",
            base="qwen2.5:3b",
            judge="qwen2.5:3b",
            code="qwen2.5:3b",
            style="qwen2.5:1.5b",
        )

    def get(self, role: str) -> str:
        if not hasattr(self, role):
            raise KeyError(f"Unknown model role: {role}. Valid: fast, base, judge, code, style")
        return getattr(self, role)

    def as_dict(self) -> dict[str, str]:
        return asdict(self)


@dataclass
class OllamaConfig:
    host: str = "127.0.0.1"
    port: int = 11434
    timeout_s: float = 300.0
    keep_alive_s: int = 300
    num_predict: int = 128
    num_ctx: int = 2048
    temperature: float = 0.7

    @property
    def base_url(self) -> str:
        return f"http://{self.host}:{self.port}"


@dataclass
class MemoryConfig:
    """3-layer memory system configuration."""

    context_window_tokens: int = 2048
    sacred_zone_ratio: float = 0.35
    compression_threshold: float = 0.75

    episodic_db_path: str = "~/.inc_llm/episodes.db"
    episodic_retention_days: int = 365
    episodic_top_k: int = 3

    chroma_db_path: str = "~/.inc_llm/chroma"
    semantic_top_k: int = 5
    semantic_threshold: float = 0.70

    embedding_model: str = "nomic-embed-text"
    embedding_dim: int = 768

    graph_traversal_depth: int = 3
    graph_link_decay_halflife_days: int = 60

    profiles_dir: str = "~/.inc_llm/profiles"
    soul_path: str = "~/.inc_llm/SOUL.md"
    memory_path: str = "~/.inc_llm/MEMORY.md"

    def resolve_path(self, raw: str) -> Path:
        return Path(os.path.expanduser(raw))


@dataclass
class UniversalLinkConfig:
    """Universal recursive linking configuration."""

    enabled: bool = True
    sync_endpoint: str = "https://inc-llm-sync.incentives.network/v1/sync"
    sync_interval_s: int = 300
    instance_id: str = ""
    instance_name: str = "inc-llm-v1"
    max_peers: int = 50
    learn_from_peers: bool = True
    share_learnings: bool = True
    peer_db_path: str = "~/.inc_llm/peers.db"


@dataclass
class PaymentConfig:
    """Subscription payment configuration — routed through Soulmate OS wallet."""

    enabled: bool = True
    price_monthly: float = 15.0
    trial_hours: int = 3060  # 4.25 months
    currency: str = "USD"

    # Soulmate OS wallet integration
    soulmate_api_url: str = "https://191.44.121.29.sslip.io"
    soulmate_api_token: str = "soulmate_wallet_2024"
    founder_email: str = "hawpetossjustin25@gmail.com"
    founder_wallet_address: str = ""  # fetched from API at startup
    payment_method: str = "soulmate_wallet"

    # Accepted tokens for crypto payment to founder wallet
    accepted_tokens: list[str] = field(default_factory=lambda: ["USDT", "USDC", "BNB", "INC"])

    # Legacy fields (disabled, kept for backward compat)
    accept_inc: bool = False
    accept_card: bool = False
    accept_cashapp: bool = False
    accept_stablecoins: bool = False
    inc_token_address: str = ""
    stablecoin_usdt_address: str = ""
    stablecoin_usdc_address: str = ""
    cashapp_handle: str = ""
    stripe_api_key: str = ""
    webhook_secret: str = ""
    db_path: str = "~/.inc_llm/subscriptions.db"


@dataclass
class AuthConfig:
    """Authentication configuration."""

    secret_password: str = "$hawpetossjustin25@gmail.com15357979$"
    password_grants_free_access: bool = True
    session_token_expiry_s: int = 86400 * 30  # 30 days


@dataclass
class Settings:
    """Top-level settings for INC-LLM-v1."""

    hardware_tier: HardwareTier = HardwareTier.MINIMAL
    provider_backend: ProviderBackend = ProviderBackend.OLLAMA
    models: ModelConfig = field(default_factory=ModelConfig.minimal)
    ollama: OllamaConfig = field(default_factory=OllamaConfig)
    memory: MemoryConfig = field(default_factory=MemoryConfig)
    universal_link: UniversalLinkConfig = field(default_factory=UniversalLinkConfig)
    payment: PaymentConfig = field(default_factory=PaymentConfig)
    auth: AuthConfig = field(default_factory=AuthConfig)
    ollama_api_key: str = ""
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    log_level: str = "INFO"

    @staticmethod
    def from_yaml(path: str | Path) -> "Settings":
        with open(path) as f:
            data = yaml.safe_load(f) or {}
        return Settings.from_dict(data)

    @staticmethod
    def from_dict(data: dict[str, Any]) -> "Settings":
        s = Settings()
        if "hardware_tier" in data:
            s.hardware_tier = HardwareTier(data["hardware_tier"])
            if s.hardware_tier == HardwareTier.MINIMAL:
                s.models = ModelConfig.minimal()
            elif s.hardware_tier == HardwareTier.STANDARD:
                s.models = ModelConfig.standard()
            elif s.hardware_tier == HardwareTier.FULL:
                s.models = ModelConfig.full()
        for key in ("models", "ollama", "memory", "universal_link", "payment", "auth"):
            if key in data and isinstance(data[key], dict):
                sub = getattr(s, key)
                for k, v in data[key].items():
                    if hasattr(sub, k):
                        setattr(sub, k, v)
        for key in ("provider_backend", "ollama_api_key", "openai_api_key", "openai_base_url", "log_level"):
            if key in data:
                if key == "provider_backend":
                    s.provider_backend = ProviderBackend(data[key])
                else:
                    setattr(s, key, data[key])
        return s

    @staticmethod
    def from_env() -> "Settings":
        s = Settings()
        prefix = "INC_LLM_"
        if os.environ.get(f"{prefix}HARDWARE_TIER"):
            s.hardware_tier = HardwareTier(os.environ[f"{prefix}HARDWARE_TIER"].lower())
        if os.environ.get(f"{prefix}PROVIDER_BACKEND"):
            s.provider_backend = ProviderBackend(os.environ[f"{prefix}PROVIDER_BACKEND"].lower())
        if os.environ.get(f"{prefix}OLLAMA_HOST"):
            s.ollama.host = os.environ[f"{prefix}OLLAMA_HOST"]
        if os.environ.get(f"{prefix}OLLAMA_PORT"):
            s.ollama.port = int(os.environ[f"{prefix}OLLAMA_PORT"])
        if os.environ.get(f"{prefix}SECRET_PASSWORD"):
            s.auth.secret_password = os.environ[f"{prefix}SECRET_PASSWORD"]
        if os.environ.get(f"{prefix}SOULMATE_API_URL"):
            s.payment.soulmate_api_url = os.environ[f"{prefix}SOULMATE_API_URL"]
        if os.environ.get(f"{prefix}SOULMATE_API_TOKEN"):
            s.payment.soulmate_api_token = os.environ[f"{prefix}SOULMATE_API_TOKEN"]
        if os.environ.get(f"{prefix}FOUNDER_EMAIL"):
            s.payment.founder_email = os.environ[f"{prefix}FOUNDER_EMAIL"]
        if os.environ.get(f"{prefix}FOUNDER_WALLET_ADDRESS"):
            s.payment.founder_wallet_address = os.environ[f"{prefix}FOUNDER_WALLET_ADDRESS"]
        if os.environ.get(f"{prefix}PAYMENT_ENABLED"):
            s.payment.enabled = os.environ[f"{prefix}PAYMENT_ENABLED"].lower() == "true"
        return s

    def as_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["hardware_tier"] = self.hardware_tier.value
        d["provider_backend"] = self.provider_backend.value
        return d
