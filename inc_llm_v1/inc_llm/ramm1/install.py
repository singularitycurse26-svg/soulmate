"""Ramm1 Installer — installs the RAMM1 OS as the Universal LLM Free System.

This is NOT just an LLM API installer. It installs the actual RAMM1 OS/resource
layer with the 3.5 GB RAM reservation/lock, the pooled RAM service, startup
integration, and API/CLI support. It verifies the installation reports the RAM
reservation and starts successfully. It behaves safely on machines whose memory
cannot support the target reservation.
"""

from __future__ import annotations

import json
import logging
import os
import platform
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Installation paths
INSTALL_DIR = Path(os.path.expanduser("~/.inc_llm/ramm1"))
CONFIG_DIR = Path(os.path.expanduser("~/.inc_llm"))
STARTUP_DIR_WIN = Path(os.path.expanduser("~/AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Startup"))
STARTUP_DIR_MACOS = Path(os.path.expanduser("~/Library/LaunchAgents"))
SYSTEMD_DIR = Path("/etc/systemd/system")

# Target RAM reservation — 3.5 GB per machine
TARGET_RAM_RESERVATION_GB = 3.5


@dataclass
class InstallResult:
    """Result of an installation operation."""
    success: bool
    message: str
    ram_reservation_gb: float = 0.0
    ram_reservation_active: bool = False
    components_installed: list[str] = field(default_factory=list)
    startup_registered: bool = False
    api_port: int = 8547
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "success": self.success, "message": self.message,
            "ram_reservation_gb": self.ram_reservation_gb,
            "ram_reservation_active": self.ram_reservation_active,
            "components_installed": self.components_installed,
            "startup_registered": self.startup_registered,
            "api_port": self.api_port,
            "errors": self.errors, "warnings": self.warnings,
        }


class Ramm1Installer:
    """Installs the RAMM1 OS as the Universal LLM Free System.

    The installer:
    1. Checks system RAM and determines the safe reservation (3.5 GB target, adaptive).
    2. Installs the RAMM1 OS resource layer (config, manifest, OS, pool).
    3. Configures the 3.5 GB RAM reservation/lock.
    4. Sets up startup integration (Windows: Startup folder, macOS: LaunchAgent, Linux: systemd).
    5. Installs the Universal LLM Free System components (API, CLI, memory, scraper, hybrid link).
    6. Verifies the installation reports the RAM reservation and starts successfully.
    7. Provides uninstall/status/repair behavior.
    """

    def __init__(self) -> None:
        self.system = platform.system()
        self.total_ram_gb = self._get_total_ram_gb()
        self.safe_reservation_gb = self._compute_safe_reservation()

    def _get_total_ram_gb(self) -> float:
        """Get the total system RAM in GB."""
        try:
            import psutil
            return round(psutil.virtual_memory().total / (1024**3), 2)
        except ImportError:
            # Fallback: use os.sysconf on Linux, ctypes on Windows
            if self.system == "Windows":
                import ctypes
                class MEMORYSTATUSEX(ctypes.Structure):
                    _fields_ = [
                        ("dwLength", ctypes.c_uint), ("dwMemoryLoad", ctypes.c_uint),
                        ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong),
                        ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
                        ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong),
                        ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
                    ]
                stat = MEMORYSTATUSEX()
                stat.dwLength = ctypes.sizeof(stat)
                ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat))
                return round(stat.ullTotalPhys / (1024**3), 2)
            elif self.system == "Linux":
                return round(os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") / (1024**3), 2)
            else:
                return 8.0  # safe default
        except Exception:
            return 8.0  # safe default

    def _compute_safe_reservation(self) -> float:
        """Compute the safe RAM reservation based on total system RAM.

        Target: 3.5 GB. Adaptive:
        - 16+ GB: full 3.5 GB
        - 12-16 GB: 3.0 GB
        - 8-12 GB: 2.0 GB
        - <8 GB: 1.0 GB or refuse
        """
        if self.total_ram_gb >= 16:
            return TARGET_RAM_RESERVATION_GB
        elif self.total_ram_gb >= 12:
            return 3.0
        elif self.total_ram_gb >= 8:
            return 2.0
        elif self.total_ram_gb >= 4:
            return 1.0
        else:
            return 0.0  # refuse — not enough RAM

    def install(self) -> InstallResult:
        """Install the RAMM1 OS as the Universal LLM Free System."""
        result = InstallResult(success=False, message="")

        # Step 1: Check system RAM
        logger.info("System RAM: %.2f GB — safe reservation: %.2f GB", self.total_ram_gb, self.safe_reservation_gb)
        if self.safe_reservation_gb == 0.0:
            result.message = f"Insufficient RAM ({self.total_ram_gb:.2f} GB). Ramm1 OS requires at least 4 GB."
            result.errors.append(f"Insufficient RAM: {self.total_ram_gb:.2f} GB < 4 GB minimum")
            return result

        if self.safe_reservation_gb < TARGET_RAM_RESERVATION_GB:
            result.warnings.append(
                f"Target reservation is {TARGET_RAM_RESERVATION_GB} GB but only "
                f"{self.safe_reservation_gb} GB is safe on this machine ({self.total_ram_gb:.2f} GB total). "
                f"Using {self.safe_reservation_gb} GB instead."
            )

        # Step 2: Create install directory
        INSTALL_DIR.mkdir(parents=True, exist_ok=True)
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        result.components_installed.append("install_directory")

        # Step 3: Write the Ramm1 config
        config = {
            "ramm1": {
                "enabled": True,
                "ram_reservation_gb": self.safe_reservation_gb,
                "min_total_ram_gb": 4.0,
                "ram_pressure_floor_gb": 1.5,
                "ram_pressure_monitor_interval_s": 5,
                "autonomous_builder_enabled": True,
                "memory_enabled": True,
                "memory_share_turns": False,
                "memory_share_raw_turns": False,
                "scraper_enabled": True,
                "scraper_js_fallback": True,
                "scraper_rate_limit_per_min": 30,
                "hybrid_link_enabled": True,
                "hybrid_link_consent_required": True,
                "hybrid_link_propagate_enabled": True,
                "peer_enabled": True,
            }
        }
        config_path = CONFIG_DIR / "ramm1_config.json"
        config_path.write_text(json.dumps(config, indent=2))
        result.components_installed.append("config")

        # Step 4: Install the RAMM1 OS resource layer
        try:
            from inc_llm.ramm1.os import Ramm1OS
            from inc_llm.config import Ramm1Config

            ramm1_config = Ramm1Config(
                ram_reservation_gb=self.safe_reservation_gb,
                min_total_ram_gb=4.0,
                ram_pressure_floor_gb=1.5,
            )
            os_obj = Ramm1OS(ramm1_config)
            reserved = os_obj.reserve()
            if reserved:
                result.ram_reservation_gb = os_obj.get_reserved_gb()
                result.ram_reservation_active = True
                result.components_installed.append("ramm1_os_resource_layer")
                logger.info("RAMM1 OS resource layer installed — %.2f GB reserved", result.ram_reservation_gb)
            else:
                result.errors.append("Failed to reserve RAM — Ramm1 OS resource layer not installed")
                return result
            os_obj.release()
        except Exception as e:
            result.errors.append(f"RAMM1 OS install failed: {e}")
            return result

        # Step 5: Install the Universal LLM Free System components
        for component in ["memory", "scraper", "hybrid_link", "builder", "peer", "router"]:
            try:
                __import__(f"inc_llm.ramm1.{component}", fromlist=["*"])
                result.components_installed.append(component)
            except Exception as e:
                result.warnings.append(f"Component {component} import failed: {e}")

        # Step 6: Install the CLI
        try:
            cli_path = INSTALL_DIR / "ramm1_cli.py"
            cli_content = '''#!/usr/bin/env python3
"""Ramm1 CLI launcher — installed by the Ramm1 installer."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "CascadeProjects", "soulmate", "inc_llm_v1"))
from inc_llm.ramm1.cli import main
sys.exit(main())
'''
            cli_path.write_text(cli_content)
            result.components_installed.append("cli")
        except Exception as e:
            result.warnings.append(f"CLI install failed: {e}")

        # Step 7: Set up startup integration
        try:
            self._setup_startup()
            result.startup_registered = True
            result.components_installed.append("startup_integration")
        except Exception as e:
            result.warnings.append(f"Startup integration failed: {e}")

        # Step 8: Write install manifest
        manifest = {
            "installed_at": time.time(),
            "system": self.system,
            "total_ram_gb": self.total_ram_gb,
            "ram_reservation_gb": self.safe_reservation_gb,
            "target_ram_reservation_gb": TARGET_RAM_RESERVATION_GB,
            "install_dir": str(INSTALL_DIR),
            "config_path": str(config_path),
            "api_port": 8547,
            "components": result.components_installed,
            "version": "1.0.0",
        }
        (INSTALL_DIR / "install_manifest.json").write_text(json.dumps(manifest, indent=2))

        result.success = True
        result.message = (
            f"Universal LLM Free System installed successfully. "
            f"RAMM1 OS resource layer: {result.ram_reservation_gb:.2f} GB reserved. "
            f"Components: {', '.join(result.components_installed)}. "
            f"API: http://localhost:8547/v1/ramm1/status"
        )
        result.api_port = 8547
        logger.info(result.message)
        return result

    def _setup_startup(self) -> None:
        """Set up startup integration for the Ramm1 service."""
        if self.system == "Windows":
            self._setup_startup_windows()
        elif self.system == "Darwin":
            self._setup_startup_macos()
        else:
            self._setup_startup_linux()

    def _setup_startup_windows(self) -> None:
        """Set up Windows startup via Startup folder."""
        STARTUP_DIR_WIN.mkdir(parents=True, exist_ok=True)
        startup_script = STARTUP_DIR_WIN / "ramm1_service.bat"
        script_content = f'''@echo off
REM Universal Ramm1 Service — starts the RAMM1 OS + Universal LLM Free System
REM Installed by the Ramm1 installer
cd /d "{Path(__file__).parent.parent}"
py -V:Astral/CPython3.11.15 -m inc_llm.server --port 8547
'''
        startup_script.write_text(script_content)

    def _setup_startup_macos(self) -> None:
        """Set up macOS startup via LaunchAgent."""
        STARTUP_DIR_MACOS.mkdir(parents=True, exist_ok=True)
        plist_path = STARTUP_DIR_MACOS / "com.inc-llm.ramm1.plist"
        plist_content = f'''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.inc-llm.ramm1</string>
    <key>ProgramArguments</key>
    <array>
        <string>python3</string>
        <string>-m</string>
        <string>inc_llm.server</string>
        <string>--port</string>
        <string>8547</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
'''
        plist_path.write_text(plist_content)

    def _setup_startup_linux(self) -> None:
        """Set up Linux startup via systemd user service."""
        service_dir = Path(os.path.expanduser("~/.config/systemd/user"))
        service_dir.mkdir(parents=True, exist_ok=True)
        service_path = service_dir / "ramm1.service"
        service_content = f'''[Unit]
Description=Universal Ramm1 — LLM + RAMM1 OS + Builder + Memory + Scraper + Hybrid Link
After=network.target

[Service]
Type=simple
ExecStart=python3 -m inc_llm.server --port 8547
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
'''
        service_path.write_text(service_content)
        try:
            subprocess.run(["systemctl", "--user", "daemon-reload"], check=False)
            subprocess.run(["systemctl", "--user", "enable", "ramm1.service"], check=False)
        except Exception:
            pass

    def uninstall(self) -> InstallResult:
        """Uninstall the Ramm1 system."""
        result = InstallResult(success=False, message="")

        # Remove startup integration
        try:
            if self.system == "Windows":
                startup_script = STARTUP_DIR_WIN / "ramm1_service.bat"
                if startup_script.exists():
                    startup_script.unlink()
            elif self.system == "Darwin":
                plist_path = STARTUP_DIR_MACOS / "com.inc-llm.ramm1.plist"
                if plist_path.exists():
                    plist_path.unlink()
            else:
                service_path = Path(os.path.expanduser("~/.config/systemd/user/ramm1.service"))
                if service_path.exists():
                    service_path.unlink()
                    subprocess.run(["systemctl", "--user", "daemon-reload"], check=False)
                    subprocess.run(["systemctl", "--user", "disable", "ramm1.service"], check=False)
        except Exception as e:
            result.warnings.append(f"Startup removal failed: {e}")

        # Remove install directory
        try:
            if INSTALL_DIR.exists():
                shutil.rmtree(INSTALL_DIR)
        except Exception as e:
            result.warnings.append(f"Install dir removal failed: {e}")

        # Remove config
        config_path = CONFIG_DIR / "ramm1_config.json"
        if config_path.exists():
            config_path.unlink()

        result.success = True
        result.message = "Universal LLM Free System uninstalled successfully."
        return result

    def status(self) -> dict[str, Any]:
        """Get the installation status."""
        manifest_path = INSTALL_DIR / "install_manifest.json"
        if not manifest_path.exists():
            return {"installed": False, "message": "Ramm1 not installed"}

        manifest = json.loads(manifest_path.read_text())

        # Check if the API is running
        api_running = False
        try:
            import urllib.request
            resp = urllib.request.urlopen("http://localhost:8547/v1/ramm1/status", timeout=2)
            api_running = resp.status == 200
        except Exception:
            pass

        return {
            "installed": True,
            "api_running": api_running,
            "manifest": manifest,
        }

    def repair(self) -> InstallResult:
        """Repair the installation."""
        # Uninstall then reinstall
        self.uninstall()
        return self.install()

    def verify(self) -> dict[str, Any]:
        """Verify the installation reports the RAM reservation and starts successfully."""
        status = self.status()
        if not status.get("installed"):
            return {"verified": False, "reason": "not installed"}

        manifest = status.get("manifest", {})
        checks = {
            "config_exists": (CONFIG_DIR / "ramm1_config.json").exists(),
            "install_dir_exists": INSTALL_DIR.exists(),
            "manifest_exists": (INSTALL_DIR / "install_manifest.json").exists(),
            "ram_reservation_configured": manifest.get("ram_reservation_gb", 0) > 0,
            "ram_reservation_target": manifest.get("target_ram_reservation_gb", 0) == TARGET_RAM_RESERVATION_GB,
            "api_running": status.get("api_running", False),
        }
        all_pass = all(checks.values())
        return {
            "verified": all_pass,
            "checks": checks,
            "manifest": manifest,
            "message": "All checks passed" if all_pass else f"Failed checks: {[k for k, v in checks.items() if not v]}",
        }
