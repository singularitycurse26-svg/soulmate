"""Install API — FastAPI router for the Ramm1 installer.

Endpoints:
- POST /v1/ramm1/install — install RAMM1 OS as the Universal LLM Free System
- POST /v1/ramm1/uninstall — uninstall Ramm1
- GET /v1/ramm1/install/status — get installation status
- POST /v1/ramm1/install/repair — repair the installation
- GET /v1/ramm1/install/verify — verify the installation
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/ramm1/install", tags=["ramm1-installer"])


@router.post("")
async def install() -> dict[str, Any]:
    """Install the RAMM1 OS as the Universal LLM Free System."""
    from inc_llm.ramm1.install import Ramm1Installer
    installer = Ramm1Installer()
    result = installer.install()
    return result.to_dict()


@router.post("/uninstall")
async def uninstall() -> dict[str, Any]:
    """Uninstall the Ramm1 system."""
    from inc_llm.ramm1.install import Ramm1Installer
    installer = Ramm1Installer()
    result = installer.uninstall()
    return result.to_dict()


@router.get("/status")
async def status() -> dict[str, Any]:
    """Get the installation status."""
    from inc_llm.ramm1.install import Ramm1Installer
    installer = Ramm1Installer()
    return installer.status()


@router.post("/repair")
async def repair() -> dict[str, Any]:
    """Repair the installation."""
    from inc_llm.ramm1.install import Ramm1Installer
    installer = Ramm1Installer()
    result = installer.repair()
    return result.to_dict()


@router.get("/verify")
async def verify() -> dict[str, Any]:
    """Verify the installation reports the RAM reservation and starts successfully."""
    from inc_llm.ramm1.install import Ramm1Installer
    installer = Ramm1Installer()
    return installer.verify()
