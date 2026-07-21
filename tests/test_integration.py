"""Tests for Cascade integration installer."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from fable_mythos.integration.cascade_installer import CascadeInstaller, HOOK_CONFIG


class TestCascadeInstaller:
    def test_install_creates_hooks(self, tmp_path):
        installer = CascadeInstaller(windsurf_dir=tmp_path / ".windsurf")
        results = installer.install()
        assert "hooks" in results
        hooks = results["hooks"]
        assert "fable_mythos_session_start.py" in hooks
        assert "fable_mythos_pre_tool_use.py" in hooks
        assert "fable_mythos_post_tool_use.py" in hooks
        assert "fable_mythos_session_end.py" in hooks

        # Verify files exist
        hooks_dir = tmp_path / ".windsurf" / "hooks"
        assert (hooks_dir / "fable_mythos_session_start.py").exists()
        assert (hooks_dir / "fable_mythos_pre_tool_use.py").exists()

    def test_install_creates_workflow(self, tmp_path):
        installer = CascadeInstaller(windsurf_dir=tmp_path / ".windsurf")
        results = installer.install()
        assert "workflow" in results
        workflow_path = Path(results["workflow"])
        assert workflow_path.exists()
        content = workflow_path.read_text()
        assert "Fable-Mythos" in content

    def test_install_creates_skills(self, tmp_path):
        installer = CascadeInstaller(windsurf_dir=tmp_path / ".windsurf")
        results = installer.install()
        assert "skills" in results
        skills_dir = tmp_path / ".windsurf" / "skills"
        assert skills_dir.exists()
        # At least the default skill
        assert (skills_dir / "fable-mythos-reasoning.md").exists()

    def test_install_creates_config(self, tmp_path):
        installer = CascadeInstaller(windsurf_dir=tmp_path / ".windsurf")
        results = installer.install()
        assert "config" in results
        config_path = Path(results["config"])
        assert config_path.exists()
        config = json.loads(config_path.read_text())
        assert config["fable_mythos_installed"] is True
        assert "hooks" in config
        assert "SessionStart" in config["hooks"]

    def test_install_memory_bridge(self, tmp_path):
        # Create source files
        fablemythos_dir = Path.home() / ".fablemythos"
        fablemythos_dir.mkdir(parents=True, exist_ok=True)
        (fablemythos_dir / "MEMORY.md").write_text("Test memory facts")
        (fablemythos_dir / "SOUL.md").write_text("Test soul")

        installer = CascadeInstaller(windsurf_dir=tmp_path / ".windsurf")
        project_dir = tmp_path / "myproject"
        results = installer.install(project_dir=project_dir)
        assert "memory_bridge" in results
        bridge = results["memory_bridge"]
        assert "memory" in bridge
        assert "soul" in bridge
        assert "ledger" in bridge

        # Verify files
        fable_dir = project_dir / ".fable"
        assert (fable_dir / "MEMORY.md").exists()
        assert (fable_dir / "SOUL.md").exists()
        assert (fable_dir / "LEDGER.md").exists()

    def test_uninstall_removes_hooks(self, tmp_path):
        installer = CascadeInstaller(windsurf_dir=tmp_path / ".windsurf")
        installer.install()
        results = installer.uninstall()
        assert len(results["removed_hooks"]) == 4
        hooks_dir = tmp_path / ".windsurf" / "hooks"
        assert not list(hooks_dir.glob("fable_mythos_*.py"))

    def test_uninstall_removes_workflow(self, tmp_path):
        installer = CascadeInstaller(windsurf_dir=tmp_path / ".windsurf")
        installer.install()
        results = installer.uninstall()
        assert "removed_workflow" in results

    def test_status_not_installed(self, tmp_path):
        installer = CascadeInstaller(windsurf_dir=tmp_path / ".windsurf")
        status = installer.status()
        assert status["hooks_dir_exists"] is False
        assert status["workflow_installed"] is False
        assert status["config_has_fable_mythos"] is False

    def test_status_installed(self, tmp_path):
        installer = CascadeInstaller(windsurf_dir=tmp_path / ".windsurf")
        installer.install()
        status = installer.status()
        assert status["hooks_dir_exists"] is True
        assert len(status["hooks_installed"]) == 4
        assert status["workflow_installed"] is True
        assert status["config_has_fable_mythos"] is True

    def test_hook_config_structure(self):
        assert "hooks" in HOOK_CONFIG
        assert "SessionStart" in HOOK_CONFIG["hooks"]
        assert "PreToolUse" in HOOK_CONFIG["hooks"]
        assert "PostToolUse" in HOOK_CONFIG["hooks"]
        assert "SessionEnd" in HOOK_CONFIG["hooks"]
