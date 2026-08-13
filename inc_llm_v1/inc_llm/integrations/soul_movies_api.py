"""SoulMovies API — REST endpoints for the SoulMovies video maker.

Provides endpoints for creating videos, checking render progress,
listing projects, downloading, and publishing to SoulTube.
"""

from __future__ import annotations

import logging
import os
from typing import Any

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse

from inc_llm.integrations.soul_movies import SoulMoviesEngine, RenderMode, VideoProject, ProjectStatus

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/soulmovies", tags=["soulmovies"])

_engine: SoulMoviesEngine | None = None


def init_soul_movies_api(engine: SoulMoviesEngine) -> None:
    global _engine
    _engine = engine


def _get_engine() -> SoulMoviesEngine:
    if _engine is None:
        raise HTTPException(status_code=503, detail="SoulMovies engine not initialized")
    return _engine


@router.post("/create")
async def create_video(body: dict[str, Any]) -> dict[str, Any]:
    """Start video generation from text description."""
    engine = _get_engine()

    text = body.get("text", "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")

    style = body.get("style", "cinematic")
    mode_str = body.get("mode", "auto")
    try:
        mode = RenderMode(mode_str)
    except ValueError:
        mode = RenderMode.AUTO

    resolution = body.get("resolution")
    duration = body.get("duration_s")

    project = await engine.generate_video(
        text_description=text,
        style=style,
        mode=mode,
        resolution=resolution,
        duration_s=duration,
    )

    return {
        "project_id": project.project_id,
        "status": project.status.value,
        "progress": project.progress,
        "text": project.text_description[:100],
        "style": project.style,
        "mode": project.mode.value,
        "resolution": project.resolution,
        "duration_s": project.duration_s,
    }


@router.get("/status/{project_id}")
async def get_status(project_id: str) -> dict[str, Any]:
    """Get render progress for a project."""
    engine = _get_engine()
    project = engine.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return {
        "project_id": project.project_id,
        "status": project.status.value,
        "progress": project.progress,
        "scenes": [
            {
                "index": s.index,
                "prompt": s.prompt[:80],
                "render_status": s.render_status,
                "duration_s": s.duration_s,
            }
            for s in project.scenes
        ],
        "output_path": project.output_path if project.status == ProjectStatus.COMPLETE else "",
        "error": project.error,
    }


@router.get("/list")
async def list_projects() -> dict[str, Any]:
    """List all video projects."""
    engine = _get_engine()
    return {"projects": engine.list_projects()}


@router.get("/download/{project_id}")
async def download_video(project_id: str) -> FileResponse:
    """Download the final MP4 video."""
    engine = _get_engine()
    project = engine.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.status != ProjectStatus.COMPLETE or not project.output_path:
        raise HTTPException(status_code=400, detail="Video not ready")
    if not os.path.exists(project.output_path):
        raise HTTPException(status_code=404, detail="Video file not found")

    return FileResponse(
        project.output_path,
        media_type="video/mp4",
        filename=f"soulmovies_{project_id}.mp4",
    )


@router.post("/publish/{project_id}")
async def publish_to_soultube(project_id: str) -> dict[str, Any]:
    """Publish a completed video to SoulTube."""
    engine = _get_engine()
    project = engine.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.status != ProjectStatus.COMPLETE or not project.output_path:
        raise HTTPException(status_code=400, detail="Video not ready")

    try:
        from inc_llm.integrations.soul_tube_api import get_soul_tube_engine
        soultube = get_soul_tube_engine()
        if soultube is None:
            raise HTTPException(status_code=503, detail="SoulTube engine not initialized")

        video = await soultube.upload_video(
            file_path=project.output_path,
            metadata={
                "title": project.text_description[:100],
                "description": project.text_description,
                "tags": ["soulmovies", project.style, "ai-generated"],
                "source": "soulmovies",
            },
        )
        return {
            "published": True,
            "video_id": video.get("video_id", ""),
            "soultube_url": f"/v1/soultube/video/{video.get('video_id', '')}",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Publish to SoulTube failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Publish failed: {e}")


@router.delete("/{project_id}")
async def delete_project(project_id: str) -> dict[str, Any]:
    """Delete a video project and its files."""
    engine = _get_engine()
    project = engine.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    import os
    for scene in project.scenes:
        if scene.render_path and os.path.exists(scene.render_path):
            try:
                os.remove(scene.render_path)
            except OSError:
                pass

    if project.output_path and os.path.exists(project.output_path):
        try:
            os.remove(project.output_path)
        except OSError:
            pass

    if project.voiceover_path and os.path.exists(project.voiceover_path):
        try:
            os.remove(project.voiceover_path)
        except OSError:
            pass

    engine._projects.pop(project_id, None)
    return {"deleted": True, "project_id": project_id}


@router.get("/styles")
async def get_style_presets() -> dict[str, Any]:
    """Get available style presets."""
    engine = _get_engine()
    return {"styles": engine.get_style_presets()}


@router.get("/stats")
async def get_stats() -> dict[str, Any]:
    """Get SoulMovies engine stats."""
    engine = _get_engine()
    return engine.get_stats()
