"""Soulmate OS web frontend — serves the React app and QR code endpoints.

Serves the built React frontend from frontend/dist/ at /.
The React app has the full Soulmate OS UI with sidebar navigation:
Dashboard, Marketplace, Dating, Email, Phone, Contacts, AI, Games,
Wallet, Security, OpenClaw, Hermes, Incentives, Healing.

QR code endpoints remain available for sharing.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import HTMLResponse, Response, FileResponse
from fastapi.staticfiles import StaticFiles

from inc_llm.integrations.qr_code import generate_qr_code_png

logger = logging.getLogger(__name__)

router = APIRouter(tags=["soulmate_os"])

SOULMATE_DOMAIN = "soulmateos.com"

# Path to the built React frontend
_FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent.parent / "frontend" / "dist"


def get_base_url(request: Request) -> str:
    """Get the base URL from the request, using soulmateos.com if accessed via that domain."""
    host = request.headers.get("host", "")
    scheme = request.headers.get("x-forwarded-proto", "http")
    if SOULMATE_DOMAIN in host:
        return f"https://{SOULMATE_DOMAIN}"
    return f"{scheme}://{host}"


def _read_dist_file(relative_path: str) -> bytes | None:
    """Read a file from the frontend dist directory."""
    full_path = _FRONTEND_DIST / relative_path
    if not full_path.exists() or not full_path.is_file():
        return None
    return full_path.read_bytes()


@router.get("/", response_class=HTMLResponse)
async def landing_page(request: Request) -> HTMLResponse:
    """Serve the Soulmate OS React frontend."""
    index_html = _read_dist_file("index.html")
    if index_html is not None:
        return HTMLResponse(content=index_html.decode("utf-8"))

    # Fallback if frontend not built
    base_url = get_base_url(request)
    return HTMLResponse(content=_fallback_page(base_url), status_code=200)


@router.get("/assets/{file_path:path}")
async def serve_asset(file_path: str) -> Response:
    """Serve JS/CSS assets from the frontend dist."""
    data = _read_dist_file(f"assets/{file_path}")
    if data is None:
        raise HTTPException(status_code=404, detail="Asset not found")
    media_type = "application/javascript"
    if file_path.endswith(".css"):
        media_type = "text/css"
    elif file_path.endswith(".json"):
        media_type = "application/json"
    return Response(content=data, media_type=media_type, headers={
        "Cache-Control": "public, max-age=86400",
    })


@router.get("/locales/{file_path:path}")
async def serve_locale(file_path: str) -> Response:
    """Serve i18n locale files from the frontend dist."""
    data = _read_dist_file(f"locales/{file_path}")
    if data is None:
        raise HTTPException(status_code=404, detail="Locale not found")
    return Response(content=data, media_type="application/json", headers={
        "Cache-Control": "public, max-age=3600",
    })


def _fallback_page(base_url: str) -> str:
    """Simple fallback page if the React frontend isn't built."""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Soulmate OS</title>
    <style>
        body {{ font-family: -apple-system, sans-serif; background: #0a0a0f; color: #fff; text-align: center; padding: 80px 20px; }}
        h1 {{ color: #6c5ce7; font-size: 2.5rem; }}
        p {{ color: #888; margin-top: 10px; }}
        a {{ color: #6c5ce7; }}
    </style>
</head>
<body>
    <h1>Soulmate OS</h1>
    <p>Frontend not built. Run <code>cd frontend && npm run build</code></p>
    <p><a href="{base_url}/docs">API Docs</a> | <a href="{base_url}/v1/health">Health</a></p>
</body>
</html>"""


@router.get("/v1/qr")
async def generate_qr(url: str, size: int = 10) -> Response:
    """Generate a QR code PNG for any URL.

    Query params:
    - url: The URL to encode
    - size: Box size in pixels (default 10)
    """
    if not url:
        raise HTTPException(status_code=400, detail="url parameter is required")

    png_data = generate_qr_code_png(url, box_size=size)
    if png_data is None:
        raise HTTPException(status_code=503, detail="QR code library not available")

    return Response(content=png_data, media_type="image/png", headers={
        "Cache-Control": "public, max-age=3600",
    })


@router.get("/v1/qr/soulmate")
async def generate_soulmate_qr(request: Request) -> Response:
    """Generate a QR code for the Soulmate OS platform URL."""
    base_url = get_base_url(request)
    png_data = generate_qr_code_png(base_url, box_size=10, error_correction="H")
    if png_data is None:
        raise HTTPException(status_code=503, detail="QR code library not available")

    return Response(content=png_data, media_type="image/png", headers={
        "Cache-Control": "public, max-age=3600",
    })


@router.get("/v1/qr/soulmovies/{project_id}")
async def generate_soulmovies_qr(project_id: str, request: Request) -> Response:
    """Generate a QR code for a SoulMovies video share link."""
    base_url = get_base_url(request)
    share_url = f"{base_url}/v1/soulmovies/download/{project_id}"
    png_data = generate_qr_code_png(share_url, box_size=10, error_correction="M")
    if png_data is None:
        raise HTTPException(status_code=503, detail="QR code library not available")

    return Response(content=png_data, media_type="image/png", headers={
        "Cache-Control": "public, max-age=3600",
    })


@router.get("/v1/qr/soultube/{video_id}")
async def generate_soultube_qr(video_id: str, request: Request) -> Response:
    """Generate a QR code for a SoulTube video share link."""
    base_url = get_base_url(request)
    share_url = f"{base_url}/v1/soultube/video/{video_id}"
    png_data = generate_qr_code_png(share_url, box_size=10, error_correction="M")
    if png_data is None:
        raise HTTPException(status_code=503, detail="QR code library not available")

    return Response(content=png_data, media_type="image/png", headers={
        "Cache-Control": "public, max-age=3600",
    })
