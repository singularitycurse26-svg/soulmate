"""Configuration system for Fable-Mythos.

Supports YAML config files, environment variable overrides (FABLE_MYTHOS_ prefix),
and runtime profile switching (minimal/standard/full hardware tiers).
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field, asdict
from enum import Enum
from pathlib import Path
from typing import Any, Literal

import yaml

logger = __import__("logging").getLogger(__name__)


class HardwareTier(str, Enum):
    MINIMAL = "minimal"
    STANDARD = "standard"
    FULL = "full"


class ProviderBackend(str, Enum):
    OLLAMA = "ollama"
    OPENAI_COMPATIBLE = "openai_compatible"
    DETERMINISTIC = "deterministic"


@dataclass
class ModelConfig:
    """Model role → model name mapping for the 5-model bus."""

    fast: str = "gemma4:e4b"
    base: str = "gemma4:e4b"
    judge: str = "gemma4:e4b"
    code: str = "gemma4:e4b"
    style: str = "gemma4:e4b"

    @staticmethod
    def minimal() -> "ModelConfig":
        """Single model for all roles — low RAM (8GB)."""
        return ModelConfig(
            fast="gemma4:e4b",
            base="gemma4:e4b",
            judge="gemma4:e4b",
            code="gemma4:e4b",
            style="gemma4:e4b",
        )

    @staticmethod
    def standard() -> "ModelConfig":
        """Standard tier — 16GB RAM."""
        return ModelConfig(
            fast="gemma4:e4b",
            base="gemma4:e4b",
            judge="gemma4:e4b",
            code="gemma4:e4b",
            style="gemma4:e4b",
        )

    @staticmethod
    def full() -> "ModelConfig":
        """High-end tier — 32GB+ RAM."""
        return ModelConfig(
            fast="gemma4:e4b",
            base="gemma4:e4b",
            judge="gemma4:e4b",
            code="gemma4:e4b",
            style="gemma4:e4b",
        )

    def get(self, role: str) -> str:
        """Get model name for a role."""
        if not hasattr(self, role):
            raise KeyError(f"Unknown model role: {role}. Valid: fast, base, judge, code, style")
        return getattr(self, role)

    def as_dict(self) -> dict[str, str]:
        return asdict(self)


@dataclass
class OllamaConfig:
    """Ollama connection settings."""

    host: str = "127.0.0.1"
    port: int = 11434
    timeout_s: float = 120.0
    keep_alive_s: int = 300  # how long to keep models loaded after last use

    @property
    def base_url(self) -> str:
        return f"http://{self.host}:{self.port}"


@dataclass
class MemoryConfig:
    """3-layer memory system configuration."""

    # Working memory
    context_window_tokens: int = 32768
    sacred_zone_ratio: float = 0.35  # fraction of context reserved for sacred zone
    compression_threshold: float = 0.75  # start compressing at 75% of context window

    # Episodic memory
    episodic_db_path: str = "~/.fablemythos/episodes.db"
    episodic_retention_days: int = 90
    episodic_top_k: int = 3

    # Semantic memory
    chroma_db_path: str = "~/.fablemythos/chroma"
    semantic_top_k: int = 5
    semantic_threshold: float = 0.75

    # Embeddings
    embedding_model: str = "nomic-embed-text"
    embedding_dim: int = 768

    # Recursive memory linking
    graph_traversal_depth: int = 2
    graph_link_decay_halflife_days: int = 30

    # Profiles
    active_profile: str = "default"
    profiles_dir: str = "~/.fablemythos/profiles"

    # SOUL.md and MEMORY.md
    soul_path: str = "~/.fablemythos/SOUL.md"
    memory_path: str = "~/.fablemythos/MEMORY.md"

    def resolve_path(self, raw: str) -> Path:
        """Expand ~ and resolve a path."""
        return Path(os.path.expanduser(raw))


@dataclass
class HarnessConfig:
    """Core harness behavior settings."""

    max_loops: int = 6
    max_branches: int = 3
    default_confidence_threshold: float = 0.72
    max_repair_cycles: int = 3
    judge_temperature: float = 0.1
    triage_temperature: float = 0.1
    solve_temperature: float = 0.4
    explore_temperature: float = 0.6


@dataclass
class RMLConfig:
    """Reinforcement Machine Learning settings."""

    enabled: bool = False
    learning_rate: float = 0.05
    max_param_offset: float = 0.3
    hint_threshold: float = 1.0
    preferences_path: str = "~/.fablemythos/rml_preferences.json"


@dataclass
class ServerConfig:
    """FastAPI server settings."""

    host: str = "0.0.0.0"
    port: int = 8080
    cors_origins: list[str] = field(default_factory=lambda: ["*"])
    log_level: str = "INFO"
    api_auth_enabled: bool = False
    api_auth_keys: str = ""
    rate_limit_enabled: bool = False
    rate_limit_requests: int = 60
    rate_limit_window_s: int = 60


@dataclass
class TelegramConfig:
    """Telegram bot integration settings."""

    enabled: bool = False
    token: str = ""  # Get from @BotFather
    allowed_user_ids: str = ""  # Comma-separated Telegram user IDs
    api_base: str = "http://localhost:8080"  # Fable-Mythos API base URL


@dataclass
class Settings:
    """Top-level configuration for the entire Fable-Mythos framework."""

    hardware_tier: HardwareTier = HardwareTier.STANDARD
    provider_backend: ProviderBackend = ProviderBackend.OLLAMA
    models: ModelConfig = field(default_factory=ModelConfig.standard)
    ollama: OllamaConfig = field(default_factory=OllamaConfig)
    memory: MemoryConfig = field(default_factory=MemoryConfig)
    harness: HarnessConfig = field(default_factory=HarnessConfig)
    rml: RMLConfig = field(default_factory=RMLConfig)
    server: ServerConfig = field(default_factory=ServerConfig)
    telegram: TelegramConfig = field(default_factory=TelegramConfig)

    # OpenAI-compatible provider settings (optional, for non-Ollama use)
    openai_api_key: str | None = None
    openai_base_url: str = "https://api.openai.com/v1"

    # Storage paths
    trajectory_path: str = "~/.fablemythos/trajectories.jsonl"
    policy_path: str = "~/.fablemythos/policy_rules.json"
    skills_dir: str = "~/.fablemythos/skills"

    @staticmethod
    def from_yaml(path: str | Path) -> "Settings":
        """Load settings from a YAML file, then apply env var overrides."""
        path = Path(path)
        if not path.exists():
            logger.warning("Config file %s not found, using defaults", path)
            return Settings()

        with open(path, "r", encoding="utf-8") as f:
            raw = yaml.safe_load(f) or {}

        return Settings._from_dict(raw)

    @staticmethod
    def _from_dict(data: dict[str, Any]) -> "Settings":
        """Construct Settings from a dictionary."""
        tier_str = data.get("hardware_tier", "standard")
        tier = HardwareTier(tier_str) if tier_str in [t.value for t in HardwareTier] else HardwareTier.STANDARD

        backend_str = data.get("provider_backend", "ollama")
        backend = ProviderBackend(backend_str) if backend_str in [b.value for b in ProviderBackend] else ProviderBackend.OLLAMA

        models_data = data.get("models", {})
        if not models_data:
            models = ModelConfig.minimal() if tier == HardwareTier.MINIMAL else (
                ModelConfig.full() if tier == HardwareTier.FULL else ModelConfig.standard()
            )
        else:
            models = ModelConfig(**models_data)

        ollama = OllamaConfig(**data.get("ollama", {}))
        memory = MemoryConfig(**data.get("memory", {}))
        harness = HarnessConfig(**data.get("harness", {}))
        rml = RMLConfig(**data.get("rml", {}))
        server = ServerConfig(**data.get("server", {}))
        telegram = TelegramConfig(**data.get("telegram", {}))

        settings = Settings(
            hardware_tier=tier,
            provider_backend=backend,
            models=models,
            ollama=ollama,
            memory=memory,
            harness=harness,
            rml=rml,
            server=server,
            telegram=telegram,
            openai_api_key=data.get("openai_api_key"),
            openai_base_url=data.get("openai_base_url", "https://api.openai.com/v1"),
            trajectory_path=data.get("trajectory_path", "~/.fablemythos/trajectories.jsonl"),
            policy_path=data.get("policy_path", "~/.fablemythos/policy_rules.json"),
            skills_dir=data.get("skills_dir", "~/.fablemythos/skills"),
        )

        # Apply env var overrides
        settings._apply_env_overrides()
        return settings

    def _apply_env_overrides(self) -> None:
        """Apply FABLE_MYTHOS_ prefixed environment variable overrides."""
        prefix = "FABLE_MYTHOS_"

        # Server overrides
        if f"{prefix}HOST" in os.environ:
            self.server.host = os.environ[f"{prefix}HOST"]
        if f"{prefix}PORT" in os.environ:
            self.server.port = int(os.environ[f"{prefix}PORT"])
        if f"{prefix}LOG_LEVEL" in os.environ:
            self.server.log_level = os.environ[f"{prefix}LOG_LEVEL"]

        # Ollama overrides
        if f"{prefix}OLLAMA_HOST" in os.environ:
            self.ollama.host = os.environ[f"{prefix}OLLAMA_HOST"]
        if f"{prefix}OLLAMA_PORT" in os.environ:
            self.ollama.port = int(os.environ[f"{prefix}OLLAMA_PORT"])

        # Provider override
        if f"{prefix}PROVIDER" in os.environ:
            val = os.environ[f"{prefix}PROVIDER"].lower()
            if val in [b.value for b in ProviderBackend]:
                self.provider_backend = ProviderBackend(val)

        # Model overrides
        for role in ("fast", "base", "judge", "code", "style"):
            env_key = f"{prefix}MODEL_{role.upper()}"
            if env_key in os.environ:
                setattr(self.models, role, os.environ[env_key])

        # RML override
        if f"{prefix}RML_ENABLED" in os.environ:
            self.rml.enabled = os.environ[f"{prefix}RML_ENABLED"].lower() in ("true", "1", "yes")

        # Tier override
        if f"{prefix}TIER" in os.environ:
            val = os.environ[f"{prefix}TIER"].lower()
            if val in [t.value for t in HardwareTier]:
                self.hardware_tier = HardwareTier(val)

        # Telegram overrides
        if f"{prefix}TELEGRAM_TOKEN" in os.environ:
            self.telegram.token = os.environ[f"{prefix}TELEGRAM_TOKEN"]
            self.telegram.enabled = True
        if f"{prefix}TELEGRAM_ALLOWED_USERS" in os.environ:
            self.telegram.allowed_user_ids = os.environ[f"{prefix}TELEGRAM_ALLOWED_USERS"]
        if f"{prefix}TELEGRAM_API_BASE" in os.environ:
            self.telegram.api_base = os.environ[f"{prefix}TELEGRAM_API_BASE"]

    def to_dict(self) -> dict[str, Any]:
        """Serialize settings to a dictionary."""
        d = asdict(self)
        d["hardware_tier"] = self.hardware_tier.value
        d["provider_backend"] = self.provider_backend.value
        return d

    def to_yaml(self, path: str | Path) -> None:
        """Save settings to a YAML file."""
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            yaml.dump(self.to_dict(), f, default_flow_style=False, sort_keys=False)

    def resolve_path(self, raw: str) -> Path:
        """Expand ~ and resolve a path."""
        return Path(os.path.expanduser(raw))

    def ensure_directories(self) -> None:
        """Create all required directories if they don't exist."""
        paths_to_create = [
            self.memory.resolve_path(self.memory.episodic_db_path).parent,
            self.memory.resolve_path(self.memory.chroma_db_path),
            self.memory.resolve_path(self.memory.profiles_dir),
            self.resolve_path(self.trajectory_path).parent,
            self.resolve_path(self.skills_dir),
        ]
        for p in paths_to_create:
            p.mkdir(parents=True, exist_ok=True)


def load_settings(config_path: str | Path | None = None) -> Settings:
    """Load settings from a config file or use defaults.

    Resolution order:
    1. Explicit path argument
    2. FABLE_MYTHOS_CONFIG env var
    3. ~/.fablemythos/config.yaml
    4. ./config/default.yaml
    5. Built-in defaults
    """
    if config_path is not None:
        return Settings.from_yaml(config_path)

    env_config = os.environ.get("FABLE_MYTHOS_CONFIG")
    if env_config:
        return Settings.from_yaml(env_config)

    home_config = Path.home() / ".fablemythos" / "config.yaml"
    if home_config.exists():
        return Settings.from_yaml(home_config)

    local_config = Path("config") / "default.yaml"
    if local_config.exists():
        return Settings.from_yaml(local_config)

    logger.info("No config file found, using built-in defaults")
    return Settings()
