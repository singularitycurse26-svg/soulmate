"""Tests for the configuration system."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest

from fable_mythos.config import (
    HardwareTier,
    ModelConfig,
    OllamaConfig,
    ProviderBackend,
    Settings,
    load_settings,
)


class TestModelConfig:
    def test_standard_tier_has_different_models(self):
        cfg = ModelConfig.standard()
        assert cfg.fast != cfg.base  # fast should be smaller than base

    def test_minimal_tier_uses_same_model(self):
        cfg = ModelConfig.minimal()
        assert cfg.fast == cfg.base == cfg.judge == cfg.code == cfg.style

    def test_full_tier_has_largest_models(self):
        cfg = ModelConfig.full()
        assert "32b" in cfg.base

    def test_get_valid_role(self):
        cfg = ModelConfig.standard()
        assert cfg.get("fast") == "qwen2.5:3b"

    def test_get_invalid_role_raises(self):
        cfg = ModelConfig.standard()
        with pytest.raises(KeyError):
            cfg.get("nonexistent")

    def test_as_dict(self):
        cfg = ModelConfig(fast="a", base="b", judge="c", code="d", style="e")
        d = cfg.as_dict()
        assert d == {"fast": "a", "base": "b", "judge": "c", "code": "d", "style": "e"}


class TestOllamaConfig:
    def test_default_base_url(self):
        cfg = OllamaConfig()
        assert cfg.base_url == "http://127.0.0.1:11434"

    def test_custom_port(self):
        cfg = OllamaConfig(port=8080)
        assert cfg.base_url == "http://127.0.0.1:8080"


class TestSettings:
    def test_default_settings(self):
        s = Settings()
        assert s.hardware_tier == HardwareTier.STANDARD
        assert s.provider_backend == ProviderBackend.OLLAMA
        assert s.harness.max_loops == 6

    def test_from_yaml(self, tmp_path):
        config_content = """
hardware_tier: minimal
provider_backend: deterministic
harness:
  max_loops: 3
  max_branches: 2
"""
        config_file = tmp_path / "config.yaml"
        config_file.write_text(config_content)

        s = Settings.from_yaml(config_file)
        assert s.hardware_tier == HardwareTier.MINIMAL
        assert s.provider_backend == ProviderBackend.DETERMINISTIC
        assert s.harness.max_loops == 3
        assert s.harness.max_branches == 2

    def test_env_overrides(self, monkeypatch):
        monkeypatch.setenv("FABLE_MYTHOS_PORT", "9999")
        monkeypatch.setenv("FABLE_MYTHOS_OLLAMA_PORT", "11435")
        monkeypatch.setenv("FABLE_MYTHOS_MODEL_FAST", "test-model:1b")

        s = Settings()
        s._apply_env_overrides()

        assert s.server.port == 9999
        assert s.ollama.port == 11435
        assert s.models.fast == "test-model:1b"

    def test_to_yaml_roundtrip(self, tmp_path):
        s = Settings()
        s.server.port = 7777
        s.harness.max_loops = 10

        config_file = tmp_path / "output.yaml"
        s.to_yaml(config_file)

        loaded = Settings.from_yaml(config_file)
        assert loaded.server.port == 7777
        assert loaded.harness.max_loops == 10

    def test_ensure_directories(self, tmp_path, monkeypatch):
        monkeypatch.setenv("HOME", str(tmp_path))
        s = Settings()
        s.memory.episodic_db_path = str(tmp_path / "memory" / "episodes.db")
        s.memory.chroma_db_path = str(tmp_path / "memory" / "chroma")
        s.memory.profiles_dir = str(tmp_path / "memory" / "profiles")
        s.trajectory_path = str(tmp_path / "data" / "trajectories.jsonl")
        s.skills_dir = str(tmp_path / "skills")

        s.ensure_directories()

        assert (tmp_path / "memory").exists()
        assert (tmp_path / "memory" / "chroma").exists()
        assert (tmp_path / "memory" / "profiles").exists()
        assert (tmp_path / "data").exists()
        assert (tmp_path / "skills").exists()

    def test_resolve_path(self):
        s = Settings()
        p = s.resolve_path("~/test")
        assert "~" not in str(p)


class TestLoadSettings:
    def test_load_with_explicit_path(self, tmp_path):
        config_file = tmp_path / "config.yaml"
        config_file.write_text("hardware_tier: full\n")

        s = load_settings(config_file)
        assert s.hardware_tier == HardwareTier.FULL

    def test_load_defaults_when_no_config(self, tmp_path, monkeypatch):
        monkeypatch.setenv("HOME", str(tmp_path))
        monkeypatch.delenv("FABLE_MYTHOS_CONFIG", raising=False)

        s = load_settings()
        assert s.hardware_tier == HardwareTier.STANDARD
