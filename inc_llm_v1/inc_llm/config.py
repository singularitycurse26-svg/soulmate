"""Configuration system for incllmv2.

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

    fast: str = "incentives-incllmv2"
    base: str = "incentives-incllmv2"
    judge: str = "incentives-incllmv2"
    code: str = "incentives-incllmv2"
    style: str = "incentives-incllmv2"

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
    def minimal_dolphin() -> "ModelConfig":
        return ModelConfig(
            fast="incentives-incllmv2-dolphin",
            base="incentives-incllmv2-dolphin",
            judge="incentives-incllmv2-dolphin",
            code="incentives-incllmv2-dolphin",
            style="incentives-incllmv2-dolphin",
        )

    @staticmethod
    def standard() -> "ModelConfig":
        return ModelConfig(
            fast="incentives-incllmv2",
            base="incentives-incllmv2-dolphin",
            judge="incentives-incllmv2-dolphin",
            code="incentives-incllmv2-dolphin",
            style="incentives-incllmv2",
        )

    @staticmethod
    def full() -> "ModelConfig":
        return ModelConfig(
            fast="incentives-incllmv2",
            base="incentives-incllmv2-dolphin",
            judge="incentives-incllmv2-dolphin",
            code="incentives-incllmv2-dolphin",
            style="incentives-incllmv2",
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
    num_predict: int = 256
    num_ctx: int = 1024
    temperature: float = 0.7
    max_tokens: int = 256
    # A4: Ollama tuning params for faster inference
    num_thread: int = 0  # 0 = auto-detect
    num_batch: int = 512
    num_gpu: int = 0  # 0 = auto-detect
    mmap: bool = True

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
    instance_name: str = "incllmv2"
    max_peers: int = 50
    learn_from_peers: bool = True
    share_learnings: bool = True
    peer_db_path: str = "~/.inc_llm/peers.db"


@dataclass
class RecursiveLinkTokenConfig:
    """Recursive Link Token (RLT) system configuration.

    RLT compresses memory learnings into compact tokens for fast LLM inference.
    Instead of injecting 10K+ chars of episode/skill/fact text into the context,
    RLT injects ~200 tokens of compact link tokens like [EP:fix-bug→patched].
    """

    enabled: bool = True
    budget_tokens: int = 200  # max tokens for injected link context
    db_path: str = "~/.inc_llm/link_tokens.db"
    share_via_mesh: bool = True  # share compact tokens across mesh instead of full text
    auto_register_episodes: bool = True
    auto_register_skills: bool = True
    auto_register_facts: bool = True
    auto_register_goals: bool = True


@dataclass
class PaymentConfig:
    """Subscription payment configuration — routed through Soulmate OS wallet."""

    enabled: bool = True
    price_monthly: float = 15.0
    trial_hours: int = 10800  # 15 months (1 year 3 months)
    currency: str = "USD"

    # Soulmate OS wallet integration
    soulmate_api_url: str = "https://191.44.121.29.sslip.io"
    soulmate_api_token: str = "soulmate_wallet_2024"
    founder_email: str = "hawpetossjustin25@gmail.com"
    founder_wallet_address: str = ""  # fetched from API at startup
    payment_method: str = "soulmate_wallet"

    # Accepted tokens for crypto payment to founder wallet
    accepted_tokens: list[str] = field(default_factory=lambda: ["USDT", "USDC", "BNB", "INC"])

    # Tiered subscription pricing per hardware tier
    tiered_pricing: dict[str, float] = field(default_factory=lambda: {
        "mobile": 5.0,           # $5/mo — basic phone access
        "minimal": 15.0,         # $15/mo — current price, Pi/low-end
        "light": 25.0,           # $25/mo — laptop without GPU
        "standard": 50.0,        # $50/mo — desktop with GPU
        "full": 100.0,           # $100/mo — GPU workstation
        "maximum": 250.0,        # $250/mo — server-grade
        "datacenter": 1000.0,    # $1,000/mo — data center
        "supercomputer": 5000.0, # $5,000/mo — AI supercomputer access
    })
    supercomputer_model_size: str = "400B+"
    supercomputer_gpus_required: int = 16
    supercomputer_min_ram_gb: int = 256

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
class KnowledgeConfig:
    """Knowledge library + RAG configuration."""

    enabled: bool = True
    rag_collection: str = "knowledge_rag"
    seed_on_startup: bool = True
    files_dir: str = "inc_llm/knowledge/files"
    chunk_size_tokens: int = 500
    retrieve_top_k: int = 3


@dataclass
class CacheConfig:
    """Response cache configuration."""

    enabled: bool = True
    similarity_threshold: float = 0.92
    hot_cache_size: int = 500
    db_path: str = "~/.inc_llm/response_cache.db"


@dataclass
class VaultConfig:
    """Vault memory tier configuration."""

    enabled: bool = True
    archive_after_days: int = 30
    archive_unused_skills_after_days: int = 60
    maintenance_interval_s: int = 86400
    vault_dir: str = "~/.inc_llm/vault"
    hot_cache_max_entries: int = 1000


@dataclass
class HermesConfig:
    """Hermes Agent integration configuration."""

    enabled: bool = True
    api_url: str = "https://191.44.121.29.sslip.io"
    api_token: str = "soulmate_wallet_2024"


@dataclass
class JarvisConfig:
    """Jarvis voice integration configuration."""

    enabled: bool = True


@dataclass
class InternetConfig:
    """Internet/Wikipedia access configuration."""

    enabled: bool = True
    rate_limit_per_min: int = 10
    timeout_s: int = 15
    cache_ttl_s: int = 3600


@dataclass
class TelegramConfig:
    """Telegram bot configuration."""

    enabled: bool = True
    bot_token: str = ""
    pairing_enabled: bool = True
    voice_calls: bool = True
    webhook_url: str = ""
    polling_fallback: bool = True


@dataclass
class TradingPlatformConfig:
    """Trading platform credentials."""

    api_key: str = ""
    api_secret: str = ""
    passphrase: str = ""  # Coinbase Exchange requires a passphrase
    sandbox: bool = False  # Use Coinbase sandbox URL


@dataclass
class TradingConfig:
    """Trading platform integration configuration."""

    enabled: bool = True
    default_platform: str = "binance"
    platforms: dict[str, TradingPlatformConfig] = field(default_factory=dict)

    # Automated trading engine settings
    auto_trading_enabled: bool = False
    auto_trading_interval_s: int = 300
    auto_trading_max_position_usd: float = 100.0
    auto_trading_max_daily_loss_usd: float = 50.0
    auto_trading_symbols: list[str] = field(default_factory=lambda: ["BTCUSDT", "ETHUSDT"])
    auto_trading_platform: str = "coinbase"

    # Self-improving trading skills
    trading_skills_enabled: bool = True
    trading_skills_min_trades: int = 10
    trading_skills_share: bool = True


@dataclass
class VoiceConfig:
    """Voice engine configuration."""

    enabled: bool = True
    tts_engine: str = "edge-tts"
    stt_engine: str = "whisper"
    voice_profile: str = "en-US-GuyNeural"
    speed: float = 1.0


@dataclass
class IntegrationsConfig:
    """All third-party integrations."""

    hermes: HermesConfig = field(default_factory=HermesConfig)
    jarvis: JarvisConfig = field(default_factory=JarvisConfig)
    internet: InternetConfig = field(default_factory=InternetConfig)
    telegram: TelegramConfig = field(default_factory=TelegramConfig)
    trading: TradingConfig = field(default_factory=TradingConfig)
    voice: VoiceConfig = field(default_factory=VoiceConfig)


@dataclass
class RLOSConfig:
    """Recursive Link Operating System configuration."""

    enabled: bool = True
    primary_server: str = "http://localhost:11434"
    preload_models: list[str] = field(default_factory=list)
    keep_alive: str = "-1"
    num_parallel: int = 4
    prefix_cache_size: int = 50
    batch_window_ms: int = 50
    max_batch_size: int = 5
    health_check_interval_s: int = 30
    free_servers: list[str] = field(default_factory=list)
    enable_code_execution: bool = True
    mesh_enabled: bool = True


@dataclass
class UniversalMeshConfig:
    """Universal mesh link configuration for RLOS."""

    enabled: bool = True
    propagate_learnings: bool = True
    propagate_knowledge: bool = True
    bandwidth_limit_kbps: int = 1024
    version_tag: str = "1.0.0"


@dataclass
class HuggingFaceConfig:
    """HuggingFace publication configuration."""

    enabled: bool = True
    model_repo_id: str = "incentivesinc/incllmv2"
    dataset_repo_id: str = "incentivesinc/incllmv2-knowledge"
    token_env_var: str = "HF_TOKEN"


@dataclass
class PublishConfig:
    """Publication configuration."""

    github_repo: str = "incentivesinc/incllmv2"
    huggingface: HuggingFaceConfig = field(default_factory=HuggingFaceConfig)


@dataclass
class AuthConfig:
    """Authentication configuration."""

    secret_password: str = ""  # Set via INC_LLM_AUTH_SECRET_PASSWORD env var
    password_grants_free_access: bool = True
    session_token_expiry_s: int = 86400 * 30  # 30 days


@dataclass
class AIGamingConfig:
    """AI Gaming MPC integration configuration."""

    enabled: bool = True
    api_url: str = ""
    api_token: str = ""
    pairing_enabled: bool = True
    webhook_url: str = ""
    db_path: str = "~/.inc_llm/ai_gaming.db"
    companion_mode: bool = True
    autonomous_game_play: bool = True
    personality_traits: list[str] = field(default_factory=lambda: ["friendly", "supportive", "humorous"])
    supported_game_types: list[str] = field(default_factory=lambda: [
        "strategy", "rpg", "sandbox", "competitive", "cooperative",
        "puzzle", "simulation", "adventure", "card", "board",
    ])
    relationship_tracking: bool = True


@dataclass
class SecurityConfig:
    """Security hardening configuration."""

    enabled: bool = True
    founder_only_endpoints: bool = True
    sanitize_responses: bool = True
    require_auth_all_endpoints: bool = True


@dataclass
class ConversationSkillConfig:
    """Conversation skill creation configuration."""

    enabled: bool = True
    min_interactions_before_skill: int = 3
    share_via_universal_link: bool = True


@dataclass
class CodeSkillConfig:
    """Code writing skill creation configuration."""

    enabled: bool = True
    min_patterns_before_skill: int = 5
    cross_language_skills: bool = True
    share_via_universal_link: bool = True


@dataclass
class BiometricConfig:
    """Biometric authentication configuration."""

    enabled: bool = True
    db_path: str = "~/.inc_llm/biometric.db"
    cache_ttl_s: int = 3600


@dataclass
class SpeedSkillConfig:
    """Speed skill auto-tuning configuration."""

    enabled: bool = True
    min_interactions: int = 5
    share_via_universal_link: bool = True


@dataclass
class MetaLearnerConfig:
    """Harness-level meta-learning configuration."""

    enabled: bool = True
    min_uses_before_scoring: int = 5
    effectiveness_threshold: float = 0.3
    auto_adjust_selection: bool = True
    share_via_universal_link: bool = True


@dataclass
class SplitBitConfig:
    """Split-bit precision mathematics configuration."""

    enabled: bool = True
    # Override default quant format per tier (empty = use SplitBitMath defaults)
    tier_quant_overrides: dict[str, str] = field(default_factory=dict)
    # Use entropy-aware temperature optimization
    entropy_aware_temperature: bool = True
    # Use Bayesian effectiveness scoring in meta-learner
    bayesian_scoring: bool = True


@dataclass
class FounderWalletConfig:
    """Hidden secondary founder wallet configuration.

    NOT exported in any public API or stats.
    Only accessible by the founder with password unlock.
    Mirrors the Soulmate OS founder wallet (same address).
    """

    enabled: bool = True
    unlock_ttl_s: int = 3600
    db_path: str = "~/.inc_llm/founder_wallet.db"


@dataclass
class GamingSkillConfig:
    """AI Gaming MPC auto-skill creation configuration."""

    enabled: bool = True
    min_games_before_strategy: int = 3
    min_interactions_before_companion_skill: int = 5
    share_via_universal_link: bool = True
    track_emotional_patterns: bool = True
    track_relationship_patterns: bool = True


@dataclass
class ToolConfig:
    """Enhanced tool calling configuration."""

    enabled: bool = True
    use_native_ollama: bool = True
    parallel_execution: bool = True
    max_rounds: int = 5
    schema_validation: bool = True
    auto_create_skill: bool = True
    share_via_universal_link: bool = True
    min_calls_before_meta_skill: int = 20


@dataclass
class EvolutionConfig:
    """Self-evolving autonomous goal system configuration."""

    enabled: bool = True
    interval_s: int = 3600
    web_research: bool = True
    auto_execute_improvements: bool = False
    auto_create_skill: bool = True
    share_via_universal_link: bool = True
    min_cycles_before_meta_skill: int = 5
    benchmark_db_path: str = "~/.inc_llm/benchmarks.db"


@dataclass
class ImageGenConfig:
    """Image generation configuration (Pollinations.ai)."""

    enabled: bool = True
    output_dir: str = "~/.inc_llm/images"
    default_model: str = "flux"
    default_width: int = 1024
    default_height: int = 1024
    timeout_s: int = 60
    auto_create_skill: bool = True
    share_via_universal_link: bool = True


@dataclass
class VisionConfig:
    """Vision/image understanding configuration (Ollama vision models)."""

    enabled: bool = True
    default_model: str = "moondream2"
    fallback_model: str = "llava"
    max_image_size_mb: float = 10.0
    auto_pull_models: bool = True
    auto_create_skill: bool = True
    share_via_universal_link: bool = True
    min_analyses_before_meta_skill: int = 10


@dataclass
class PlanConfig:
    """Plan Mode configuration."""

    enabled: bool = True
    max_phases: int = 5
    max_steps_per_phase: int = 6
    auto_create_skill: bool = True
    share_via_universal_link: bool = True
    min_plans_before_meta_skill: int = 3
    auto_adjust_prompt: bool = True


@dataclass
class ExecutionConfig:
    """Autonomous execution configuration."""

    enabled: bool = True
    workspace_root: str = "~/inc_llm_projects"
    max_retries: int = 3
    checkpoint_interval_s: int = 30
    max_consecutive_failures: int = 5
    self_review: bool = True
    auto_replan: bool = True
    auto_create_skill: bool = True
    share_via_universal_link: bool = True
    min_executions_before_meta_skill: int = 10
    allowed_commands: list[str] = field(default_factory=list)


@dataclass
class FreeServerSlotConfig:
    """Free server slot management configuration."""

    total_slots: int = 10
    execution_slots: int = 5
    reserved_slots: int = 5
    health_check_interval_s: int = 300


@dataclass
class YouTubeConfig:
    """YouTube video understanding integration configuration."""

    enabled: bool = True
    prefer_transcript_api: bool = True
    whisper_fallback: bool = True
    auto_create_skill: bool = True
    share_via_universal_link: bool = True
    store_in_rag: bool = True
    max_transcript_length: int = 50000
    analysis_max_tokens: int = 2000
    cache_ttl_s: int = 86400
    languages: list[str] = field(default_factory=lambda: ["en", "en-US", "en-GB"])
    min_videos_before_pattern_skill: int = 3
    min_videos_before_meta_skill: int = 5
    auto_adjust_prompt: bool = True


@dataclass
class SoulMoviesConfig:
    """SoulMovies — text-to-video maker configuration."""

    enabled: bool = True
    default_duration_s: int = 35
    scene_count: int = 5
    scene_duration_s: int = 7
    default_resolution: str = "1080p"
    resolutions: list[str] = field(default_factory=lambda: ["720p", "1080p"])
    # Modes
    ai_video_generation: bool = True
    clip_assembly_fallback: bool = True
    # Audio
    voiceover_enabled: bool = True
    music_enabled: bool = True
    default_voice: str = "default"
    music_library_path: str = "~/.inc_llm/music"
    # Rendering
    output_dir: str = "~/.inc_llm/soulmovies"
    ffmpeg_path: str = "ffmpeg"
    transition_style: str = "crossfade"
    # Recursive link mechanics
    render_cache_enabled: bool = True
    render_cache_max_entries: int = 100
    render_cache_warm_threshold: int = 3
    render_batch_window_ms: int = 500
    render_batch_max_size: int = 5
    render_predictive_enabled: bool = True
    # Storage
    auto_publish_to_soultube: bool = False
    vault_storage: bool = True
    # GPU detection
    min_vram_gb: float = 4.0
    # Hardware tier auto-scaling for pre-fetch
    predictive_prefetch_count: int = 3
    # 30-minute scene support
    max_duration_s: int = 1800
    dynamic_scene_count: bool = True
    max_scene_duration_s: int = 15
    checkpoint_enabled: bool = True
    frame_chaining_enabled: bool = True
    act_based_storyboard: bool = True
    # Cloud GPU (free tier providers)
    cloud_gpu_enabled: bool = True
    cloud_gpu_providers: list[str] = field(default_factory=lambda: ["free_ai", "huggingface", "novai", "replicate"])
    cloud_gpu_api_keys: dict[str, str] = field(default_factory=dict)
    cloud_gpu_model: str = "cogvideox"
    cloud_gpu_timeout_s: int = 300
    cloud_gpu_fallback_to_clip_assembly: bool = True


@dataclass
class SoulTubeConfig:
    """SoulTube — YouTube alternative with RLOS mesh streaming configuration."""

    enabled: bool = True
    # Video processing
    transcoding_resolutions: list[str] = field(default_factory=lambda: ["240p", "480p", "720p", "1080p"])
    hls_segment_duration_s: int = 10
    ffmpeg_path: str = "ffmpeg"
    thumbnail_time_s: float = 1.0
    # Storage
    storage_dir: str = "~/.inc_llm/soultube"
    max_video_size_gb: float = 2.0
    auto_size_storage: bool = True
    segment_replication_factor: int = 2
    # Streaming
    adaptive_bitrate: bool = True
    p2p_streaming: bool = True
    max_streaming_connections: int = 100
    # Recursive link mechanics
    segment_cache_enabled: bool = True
    segment_cache_max_entries: int = 500
    segment_cache_warm_threshold: int = 3
    segment_batch_window_ms: int = 200
    segment_batch_max_size: int = 10
    predictive_prefetch_enabled: bool = True
    # Hardware tier auto-scaling for pre-fetch
    predictive_prefetch_count: int = 3
    # Features
    search_enabled: bool = True
    recommendations_enabled: bool = True
    engagement_enabled: bool = True
    comments_enabled: bool = True
    subscriptions_enabled: bool = True
    playlists_enabled: bool = True
    trending_enabled: bool = True
    history_enabled: bool = True
    # Monetization
    monetization_enabled: bool = True
    soul_token_per_view: float = 0.001
    min_payout_tokens: float = 100.0
    # Analytics
    analytics_enabled: bool = True
    # Database
    db_path: str = "~/.inc_llm/soultube.db"


@dataclass
class Settings:
    """Top-level settings for incllmv2."""

    hardware_tier: HardwareTier = HardwareTier.MINIMAL
    provider_backend: ProviderBackend = ProviderBackend.OLLAMA
    models: ModelConfig = field(default_factory=ModelConfig.minimal)
    ollama: OllamaConfig = field(default_factory=OllamaConfig)
    memory: MemoryConfig = field(default_factory=MemoryConfig)
    universal_link: UniversalLinkConfig = field(default_factory=UniversalLinkConfig)
    rlt: RecursiveLinkTokenConfig = field(default_factory=RecursiveLinkTokenConfig)
    payment: PaymentConfig = field(default_factory=PaymentConfig)
    auth: AuthConfig = field(default_factory=AuthConfig)
    knowledge: KnowledgeConfig = field(default_factory=KnowledgeConfig)
    cache: CacheConfig = field(default_factory=CacheConfig)
    vault: VaultConfig = field(default_factory=VaultConfig)
    integrations: IntegrationsConfig = field(default_factory=IntegrationsConfig)
    rlos: RLOSConfig = field(default_factory=RLOSConfig)
    universal_mesh: UniversalMeshConfig = field(default_factory=UniversalMeshConfig)
    publish: PublishConfig = field(default_factory=PublishConfig)
    ai_gaming: AIGamingConfig = field(default_factory=AIGamingConfig)
    security: SecurityConfig = field(default_factory=SecurityConfig)
    conversation_skills: ConversationSkillConfig = field(default_factory=ConversationSkillConfig)
    code_skills: CodeSkillConfig = field(default_factory=CodeSkillConfig)
    biometric: BiometricConfig = field(default_factory=BiometricConfig)
    speed_skills: SpeedSkillConfig = field(default_factory=SpeedSkillConfig)
    meta_learner: MetaLearnerConfig = field(default_factory=MetaLearnerConfig)
    split_bit: SplitBitConfig = field(default_factory=SplitBitConfig)
    gaming_skills: GamingSkillConfig = field(default_factory=GamingSkillConfig)
    founder_wallet: FounderWalletConfig = field(default_factory=FounderWalletConfig)
    youtube: YouTubeConfig = field(default_factory=YouTubeConfig)
    planning: PlanConfig = field(default_factory=PlanConfig)
    execution: ExecutionConfig = field(default_factory=ExecutionConfig)
    free_server_slots: FreeServerSlotConfig = field(default_factory=FreeServerSlotConfig)
    tools: ToolConfig = field(default_factory=ToolConfig)
    evolution: EvolutionConfig = field(default_factory=EvolutionConfig)
    image_gen: ImageGenConfig = field(default_factory=ImageGenConfig)
    vision: VisionConfig = field(default_factory=VisionConfig)
    soul_movies: SoulMoviesConfig = field(default_factory=SoulMoviesConfig)
    soul_tube: SoulTubeConfig = field(default_factory=SoulTubeConfig)
    ollama_api_key: str = ""
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    log_level: str = "INFO"
    multi_role_pipeline: bool = True
    max_tool_rounds: int = 3

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
        for key in ("models", "ollama", "memory", "universal_link", "rlt", "payment", "auth",
                    "knowledge", "cache", "vault", "rlos", "universal_mesh", "publish",
                    "ai_gaming", "security", "conversation_skills", "code_skills", "biometric",
                    "speed_skills", "meta_learner", "split_bit", "gaming_skills", "founder_wallet",
                    "youtube", "planning", "execution", "free_server_slots", "tools", "evolution",
                    "image_gen", "vision", "soul_movies", "soul_tube"):
            if key in data and isinstance(data[key], dict):
                sub = getattr(s, key)
                for k, v in data[key].items():
                    if hasattr(sub, k):
                        setattr(sub, k, v)
        if "integrations" in data and isinstance(data["integrations"], dict):
            for sub_key in ("hermes", "jarvis", "internet", "telegram", "trading", "voice"):
                if sub_key in data["integrations"] and isinstance(data["integrations"][sub_key], dict):
                    sub = getattr(s.integrations, sub_key)
                    for k, v in data["integrations"][sub_key].items():
                        if hasattr(sub, k):
                            setattr(sub, k, v)
        for key in ("provider_backend", "ollama_api_key", "openai_api_key", "openai_base_url", "log_level",
                     "multi_role_pipeline", "max_tool_rounds"):
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
        if os.environ.get(f"{prefix}RLOS_ENABLED"):
            s.rlos.enabled = os.environ[f"{prefix}RLOS_ENABLED"].lower() == "true"
        if os.environ.get(f"{prefix}KNOWLEDGE_ENABLED"):
            s.knowledge.enabled = os.environ[f"{prefix}KNOWLEDGE_ENABLED"].lower() == "true"
        if os.environ.get(f"{prefix}CACHE_ENABLED"):
            s.cache.enabled = os.environ[f"{prefix}CACHE_ENABLED"].lower() == "true"
        if os.environ.get(f"{prefix}VAULT_ENABLED"):
            s.vault.enabled = os.environ[f"{prefix}VAULT_ENABLED"].lower() == "true"
        if os.environ.get(f"{prefix}TELEGRAM_BOT_TOKEN"):
            s.integrations.telegram.bot_token = os.environ[f"{prefix}TELEGRAM_BOT_TOKEN"]
        if os.environ.get(f"{prefix}HF_TOKEN"):
            os.environ["HF_TOKEN"] = os.environ[f"{prefix}HF_TOKEN"]
        if os.environ.get(f"{prefix}MULTI_ROLE_PIPELINE"):
            s.multi_role_pipeline = os.environ[f"{prefix}MULTI_ROLE_PIPELINE"].lower() == "true"
        if os.environ.get(f"{prefix}MAX_TOOL_ROUNDS"):
            s.max_tool_rounds = int(os.environ[f"{prefix}MAX_TOOL_ROUNDS"])
        if os.environ.get(f"{prefix}AUTH_SECRET_PASSWORD"):
            s.auth.secret_password = os.environ[f"{prefix}AUTH_SECRET_PASSWORD"]
        elif os.environ.get(f"{prefix}SECRET_PASSWORD"):
            s.auth.secret_password = os.environ[f"{prefix}SECRET_PASSWORD"]
        if os.environ.get(f"{prefix}AI_GAMING_ENABLED"):
            s.ai_gaming.enabled = os.environ[f"{prefix}AI_GAMING_ENABLED"].lower() == "true"
        if os.environ.get(f"{prefix}AI_GAMING_API_URL"):
            s.ai_gaming.api_url = os.environ[f"{prefix}AI_GAMING_API_URL"]
        if os.environ.get(f"{prefix}AI_GAMING_API_TOKEN"):
            s.ai_gaming.api_token = os.environ[f"{prefix}AI_GAMING_API_TOKEN"]
        if os.environ.get(f"{prefix}BIOMETRIC_ENABLED"):
            s.biometric.enabled = os.environ[f"{prefix}BIOMETRIC_ENABLED"].lower() == "true"
        if os.environ.get(f"{prefix}CONVERSATION_SKILLS_ENABLED"):
            s.conversation_skills.enabled = os.environ[f"{prefix}CONVERSATION_SKILLS_ENABLED"].lower() == "true"
        if os.environ.get(f"{prefix}CODE_SKILLS_ENABLED"):
            s.code_skills.enabled = os.environ[f"{prefix}CODE_SKILLS_ENABLED"].lower() == "true"
        if os.environ.get(f"{prefix}SPEED_SKILLS_ENABLED"):
            s.speed_skills.enabled = os.environ[f"{prefix}SPEED_SKILLS_ENABLED"].lower() == "true"
        if os.environ.get(f"{prefix}SPEED_SKILLS_MIN_INTERACTIONS"):
            s.speed_skills.min_interactions = int(os.environ[f"{prefix}SPEED_SKILLS_MIN_INTERACTIONS"])
        if os.environ.get(f"{prefix}META_LEARNER_ENABLED"):
            s.meta_learner.enabled = os.environ[f"{prefix}META_LEARNER_ENABLED"].lower() == "true"
        if os.environ.get(f"{prefix}META_LEARNER_MIN_USES"):
            s.meta_learner.min_uses_before_scoring = int(os.environ[f"{prefix}META_LEARNER_MIN_USES"])
        if os.environ.get(f"{prefix}SPLIT_BIT_ENABLED"):
            s.split_bit.enabled = os.environ[f"{prefix}SPLIT_BIT_ENABLED"].lower() == "true"
        if os.environ.get(f"{prefix}GAMING_SKILLS_ENABLED"):
            s.gaming_skills.enabled = os.environ[f"{prefix}GAMING_SKILLS_ENABLED"].lower() == "true"
        if os.environ.get(f"{prefix}GAMING_SKILLS_MIN_GAMES"):
            s.gaming_skills.min_games_before_strategy = int(os.environ[f"{prefix}GAMING_SKILLS_MIN_GAMES"])
        if os.environ.get(f"{prefix}AI_GAMING_COMPANION_MODE"):
            s.ai_gaming.companion_mode = os.environ[f"{prefix}AI_GAMING_COMPANION_MODE"].lower() == "true"
        if os.environ.get(f"{prefix}AI_GAMING_AUTONOMOUS_PLAY"):
            s.ai_gaming.autonomous_game_play = os.environ[f"{prefix}AI_GAMING_AUTONOMOUS_PLAY"].lower() == "true"
        if os.environ.get(f"{prefix}TIERED_PRICING_ENABLED"):
            # Tiered pricing is enabled by default; this just confirms it
            pass
        if os.environ.get(f"{prefix}SUPERCOMPUTER_PRICE"):
            s.payment.tiered_pricing["supercomputer"] = float(os.environ[f"{prefix}SUPERCOMPUTER_PRICE"])
        if os.environ.get(f"{prefix}CURRENT_ROUTING"):
            os.environ["INC_LLM_CURRENT_ROUTING"] = os.environ[f"{prefix}CURRENT_ROUTING"]
        if os.environ.get(f"{prefix}CURRENT_ACCOUNT"):
            os.environ["INC_LLM_CURRENT_ACCOUNT"] = os.environ[f"{prefix}CURRENT_ACCOUNT"]
        # Trading config
        if os.environ.get(f"{prefix}TRADING_ENABLED"):
            s.integrations.trading.enabled = os.environ[f"{prefix}TRADING_ENABLED"].lower() == "true"
        if os.environ.get(f"{prefix}TRADING_DEFAULT_PLATFORM"):
            s.integrations.trading.default_platform = os.environ[f"{prefix}TRADING_DEFAULT_PLATFORM"]
        if os.environ.get(f"{prefix}TRADING_AUTO_ENABLED"):
            s.integrations.trading.auto_trading_enabled = os.environ[f"{prefix}TRADING_AUTO_ENABLED"].lower() == "true"
        if os.environ.get(f"{prefix}TRADING_AUTO_MAX_POSITION"):
            s.integrations.trading.auto_trading_max_position_usd = float(os.environ[f"{prefix}TRADING_AUTO_MAX_POSITION"])
        if os.environ.get(f"{prefix}TRADING_AUTO_MAX_DAILY_LOSS"):
            s.integrations.trading.auto_trading_max_daily_loss_usd = float(os.environ[f"{prefix}TRADING_AUTO_MAX_DAILY_LOSS"])
        if os.environ.get(f"{prefix}COINBASE_API_KEY"):
            from inc_llm.config import TradingPlatformConfig as _TPC
            s.integrations.trading.platforms["coinbase"] = _TPC(
                api_key=os.environ[f"{prefix}COINBASE_API_KEY"],
                api_secret=os.environ.get(f"{prefix}COINBASE_API_SECRET", ""),
                passphrase=os.environ.get(f"{prefix}COINBASE_PASSPHRASE", ""),
            )
        if os.environ.get(f"{prefix}KRAKEN_API_KEY"):
            from inc_llm.config import TradingPlatformConfig as _TPC
            s.integrations.trading.platforms["kraken"] = _TPC(
                api_key=os.environ[f"{prefix}KRAKEN_API_KEY"],
                api_secret=os.environ.get(f"{prefix}KRAKEN_API_SECRET", ""),
            )
        # Founder wallet config
        if os.environ.get(f"{prefix}FOUNDER_WALLET_ENABLED"):
            s.founder_wallet.enabled = os.environ[f"{prefix}FOUNDER_WALLET_ENABLED"].lower() == "true"
        # YouTube config
        if os.environ.get(f"{prefix}YOUTUBE_ENABLED"):
            s.youtube.enabled = os.environ[f"{prefix}YOUTUBE_ENABLED"].lower() == "true"
        if os.environ.get(f"{prefix}YOUTUBE_WHISPER_FALLBACK"):
            s.youtube.whisper_fallback = os.environ[f"{prefix}YOUTUBE_WHISPER_FALLBACK"].lower() == "true"
        if os.environ.get(f"{prefix}YOUTUBE_AUTO_CREATE_SKILL"):
            s.youtube.auto_create_skill = os.environ[f"{prefix}YOUTUBE_AUTO_CREATE_SKILL"].lower() == "true"
        if os.environ.get(f"{prefix}YOUTUBE_AUTO_ADJUST_PROMPT"):
            s.youtube.auto_adjust_prompt = os.environ[f"{prefix}YOUTUBE_AUTO_ADJUST_PROMPT"].lower() == "true"
        if os.environ.get(f"{prefix}YOUTUBE_MIN_PATTERN_SKILL"):
            s.youtube.min_videos_before_pattern_skill = int(os.environ[f"{prefix}YOUTUBE_MIN_PATTERN_SKILL"])
        if os.environ.get(f"{prefix}YOUTUBE_MIN_META_SKILL"):
            s.youtube.min_videos_before_meta_skill = int(os.environ[f"{prefix}YOUTUBE_MIN_META_SKILL"])
        # Planning config
        if os.environ.get(f"{prefix}PLANNING_ENABLED"):
            s.planning.enabled = os.environ[f"{prefix}PLANNING_ENABLED"].lower() == "true"
        if os.environ.get(f"{prefix}PLANNING_MAX_PHASES"):
            s.planning.max_phases = int(os.environ[f"{prefix}PLANNING_MAX_PHASES"])
        if os.environ.get(f"{prefix}PLANNING_MAX_STEPS"):
            s.planning.max_steps_per_phase = int(os.environ[f"{prefix}PLANNING_MAX_STEPS"])
        # Execution config
        if os.environ.get(f"{prefix}EXECUTION_ENABLED"):
            s.execution.enabled = os.environ[f"{prefix}EXECUTION_ENABLED"].lower() == "true"
        if os.environ.get(f"{prefix}EXECUTION_MAX_RETRIES"):
            s.execution.max_retries = int(os.environ[f"{prefix}EXECUTION_MAX_RETRIES"])
        if os.environ.get(f"{prefix}EXECUTION_SELF_REVIEW"):
            s.execution.self_review = os.environ[f"{prefix}EXECUTION_SELF_REVIEW"].lower() == "true"
        if os.environ.get(f"{prefix}EXECUTION_AUTO_REPLAN"):
            s.execution.auto_replan = os.environ[f"{prefix}EXECUTION_AUTO_REPLAN"].lower() == "true"
        if os.environ.get(f"{prefix}EXECUTION_WORKSPACE_ROOT"):
            s.execution.workspace_root = os.environ[f"{prefix}EXECUTION_WORKSPACE_ROOT"]
        # Free server slots config
        if os.environ.get(f"{prefix}FREE_SERVER_SLOTS_TOTAL"):
            s.free_server_slots.total_slots = int(os.environ[f"{prefix}FREE_SERVER_SLOTS_TOTAL"])
        if os.environ.get(f"{prefix}FREE_SERVER_SLOTS_EXECUTION"):
            s.free_server_slots.execution_slots = int(os.environ[f"{prefix}FREE_SERVER_SLOTS_EXECUTION"])
        # Enhanced tools config
        if os.environ.get(f"{prefix}TOOLS_ENABLED"):
            s.tools.enabled = os.environ[f"{prefix}TOOLS_ENABLED"].lower() == "true"
        if os.environ.get(f"{prefix}TOOLS_NATIVE_OLLAMA"):
            s.tools.use_native_ollama = os.environ[f"{prefix}TOOLS_NATIVE_OLLAMA"].lower() == "true"
        if os.environ.get(f"{prefix}TOOLS_PARALLEL"):
            s.tools.parallel_execution = os.environ[f"{prefix}TOOLS_PARALLEL"].lower() == "true"
        if os.environ.get(f"{prefix}TOOLS_MAX_ROUNDS"):
            s.tools.max_rounds = int(os.environ[f"{prefix}TOOLS_MAX_ROUNDS"])
        # Evolution config
        if os.environ.get(f"{prefix}EVOLUTION_ENABLED"):
            s.evolution.enabled = os.environ[f"{prefix}EVOLUTION_ENABLED"].lower() == "true"
        if os.environ.get(f"{prefix}EVOLUTION_INTERVAL"):
            s.evolution.interval_s = int(os.environ[f"{prefix}EVOLUTION_INTERVAL"])
        if os.environ.get(f"{prefix}EVOLUTION_WEB_RESEARCH"):
            s.evolution.web_research = os.environ[f"{prefix}EVOLUTION_WEB_RESEARCH"].lower() == "true"
        if os.environ.get(f"{prefix}EVOLUTION_AUTO_EXECUTE"):
            s.evolution.auto_execute_improvements = os.environ[f"{prefix}EVOLUTION_AUTO_EXECUTE"].lower() == "true"
        # Image generation config
        if os.environ.get(f"{prefix}IMAGE_GEN_ENABLED"):
            s.image_gen.enabled = os.environ[f"{prefix}IMAGE_GEN_ENABLED"].lower() == "true"
        if os.environ.get(f"{prefix}IMAGE_GEN_MODEL"):
            s.image_gen.default_model = os.environ[f"{prefix}IMAGE_GEN_MODEL"]
        if os.environ.get(f"{prefix}IMAGE_GEN_WIDTH"):
            s.image_gen.default_width = int(os.environ[f"{prefix}IMAGE_GEN_WIDTH"])
        if os.environ.get(f"{prefix}IMAGE_GEN_HEIGHT"):
            s.image_gen.default_height = int(os.environ[f"{prefix}IMAGE_GEN_HEIGHT"])
        if os.environ.get(f"{prefix}IMAGE_GEN_OUTPUT_DIR"):
            s.image_gen.output_dir = os.environ[f"{prefix}IMAGE_GEN_OUTPUT_DIR"]
        # Vision config
        if os.environ.get(f"{prefix}VISION_ENABLED"):
            s.vision.enabled = os.environ[f"{prefix}VISION_ENABLED"].lower() == "true"
        if os.environ.get(f"{prefix}VISION_MODEL"):
            s.vision.default_model = os.environ[f"{prefix}VISION_MODEL"]
        if os.environ.get(f"{prefix}VISION_FALLBACK_MODEL"):
            s.vision.fallback_model = os.environ[f"{prefix}VISION_FALLBACK_MODEL"]
        if os.environ.get(f"{prefix}VISION_MAX_SIZE_MB"):
            s.vision.max_image_size_mb = float(os.environ[f"{prefix}VISION_MAX_SIZE_MB"])
        # SoulMovies config
        if os.environ.get(f"{prefix}SOUL_MOVIES_ENABLED"):
            s.soul_movies.enabled = os.environ[f"{prefix}SOUL_MOVIES_ENABLED"].lower() == "true"
        if os.environ.get(f"{prefix}SOUL_MOVIES_DURATION"):
            s.soul_movies.default_duration_s = int(os.environ[f"{prefix}SOUL_MOVIES_DURATION"])
        if os.environ.get(f"{prefix}SOUL_MOVIES_RESOLUTION"):
            s.soul_movies.default_resolution = os.environ[f"{prefix}SOUL_MOVIES_RESOLUTION"]
        if os.environ.get(f"{prefix}SOUL_MOVIES_AI_GENERATION"):
            s.soul_movies.ai_video_generation = os.environ[f"{prefix}SOUL_MOVIES_AI_GENERATION"].lower() == "true"
        if os.environ.get(f"{prefix}SOUL_MOVIES_OUTPUT_DIR"):
            s.soul_movies.output_dir = os.environ[f"{prefix}SOUL_MOVIES_OUTPUT_DIR"]
        # SoulTube config
        if os.environ.get(f"{prefix}SOUL_TUBE_ENABLED"):
            s.soul_tube.enabled = os.environ[f"{prefix}SOUL_TUBE_ENABLED"].lower() == "true"
        if os.environ.get(f"{prefix}SOUL_TUBE_STORAGE_DIR"):
            s.soul_tube.storage_dir = os.environ[f"{prefix}SOUL_TUBE_STORAGE_DIR"]
        if os.environ.get(f"{prefix}SOUL_TUBE_P2P_STREAMING"):
            s.soul_tube.p2p_streaming = os.environ[f"{prefix}SOUL_TUBE_P2P_STREAMING"].lower() == "true"
        if os.environ.get(f"{prefix}SOUL_TUBE_MONETIZATION"):
            s.soul_tube.monetization_enabled = os.environ[f"{prefix}SOUL_TUBE_MONETIZATION"].lower() == "true"
        if os.environ.get(f"{prefix}SOUL_TUBE_DB_PATH"):
            s.soul_tube.db_path = os.environ[f"{prefix}SOUL_TUBE_DB_PATH"]
        # RLT config
        if os.environ.get(f"{prefix}RLT_ENABLED"):
            s.rlt.enabled = os.environ[f"{prefix}RLT_ENABLED"].lower() == "true"
        if os.environ.get(f"{prefix}RLT_BUDGET_TOKENS"):
            s.rlt.budget_tokens = int(os.environ[f"{prefix}RLT_BUDGET_TOKENS"])
        if os.environ.get(f"{prefix}RLT_SHARE_VIA_MESH"):
            s.rlt.share_via_mesh = os.environ[f"{prefix}RLT_SHARE_VIA_MESH"].lower() == "true"
        return s

    def as_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["hardware_tier"] = self.hardware_tier.value
        d["provider_backend"] = self.provider_backend.value
        return d
