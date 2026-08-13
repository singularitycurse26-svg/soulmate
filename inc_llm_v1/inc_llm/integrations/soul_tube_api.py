"""SoulTube API — REST endpoints for the SoulTube video platform.

Provides endpoints for uploading, streaming, searching, liking, commenting,
subscribing, trending, recommendations, analytics, and channel pages.
"""

from __future__ import annotations

import logging
import os
from typing import Any

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse, StreamingResponse

from inc_llm.integrations.soul_tube import SoulTubeEngine

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/soultube", tags=["soultube"])

_engine: SoulTubeEngine | None = None


def init_soul_tube_api(engine: SoulTubeEngine) -> None:
    global _engine
    _engine = engine


def get_soul_tube_engine() -> SoulTubeEngine | None:
    return _engine


def _get_engine() -> SoulTubeEngine:
    if _engine is None:
        raise HTTPException(status_code=503, detail="SoulTube engine not initialized")
    return _engine


@router.post("/upload")
async def upload_video(
    file: UploadFile = File(...),
    title: str = Form("Untitled"),
    description: str = Form(""),
    tags: str = Form(""),
    creator_id: str = Form("default"),
    creator_name: str = Form("Anonymous"),
) -> dict[str, Any]:
    """Upload a video file."""
    engine = _get_engine()

    import tempfile
    import shutil

    tmp_path = tempfile.mktemp(suffix=".mp4")
    with open(tmp_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []

    try:
        result = await engine.upload_video(
            file_path=tmp_path,
            metadata={"title": title, "description": description, "tags": tag_list},
            creator_id=creator_id,
            creator_name=creator_name,
        )
        return result
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass


@router.get("/stream/{video_id}")
async def stream_video(video_id: str, resolution: str = "720p") -> StreamingResponse:
    """Stream video as HLS segments."""
    engine = _get_engine()

    async def generate():
        async for chunk in engine.stream_video(video_id, resolution):
            yield chunk

    return StreamingResponse(
        generate(),
        media_type="video/mp2t",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/video/{video_id}")
async def get_video(video_id: str) -> dict[str, Any]:
    """Get video metadata."""
    engine = _get_engine()
    video = engine.get_video(video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    return video


@router.get("/thumbnail/{video_id}")
async def get_thumbnail(video_id: str) -> FileResponse:
    """Get video thumbnail."""
    engine = _get_engine()
    video = engine._videos.get(video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    if not video.thumbnail_path or not os.path.exists(video.thumbnail_path):
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    return FileResponse(video.thumbnail_path, media_type="image/jpeg")


@router.get("/search")
async def search_videos(q: str = "", limit: int = 20) -> dict[str, Any]:
    """Search videos by title, description, tags."""
    engine = _get_engine()
    if not q:
        results = await engine.get_trending(limit)
        return {"query": q, "results": results}
    results = await engine.search_videos(q, limit)
    return {"query": q, "results": results}


@router.get("/trending")
async def get_trending(limit: int = 10) -> dict[str, Any]:
    """Get trending videos."""
    engine = _get_engine()
    return {"videos": await engine.get_trending(limit)}


@router.get("/recommendations")
async def get_recommendations(user_id: str = "", limit: int = 10) -> dict[str, Any]:
    """Get personalized recommendations."""
    engine = _get_engine()
    return {"videos": await engine.get_recommendations(user_id, limit)}


@router.post("/like/{video_id}")
async def like_video(video_id: str, body: dict[str, Any]) -> dict[str, Any]:
    """Like or dislike a video."""
    engine = _get_engine()
    user_id = body.get("user_id", "default")
    liked = body.get("liked", True)
    try:
        return await engine.like_video(user_id, video_id, liked)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/comment/{video_id}")
async def add_comment(video_id: str, body: dict[str, Any]) -> dict[str, Any]:
    """Add a comment to a video."""
    engine = _get_engine()
    user_id = body.get("user_id", "default")
    user_name = body.get("user_name", "Anonymous")
    text = body.get("text", "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")
    try:
        return await engine.add_comment(video_id, user_id, user_name, text)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/comments/{video_id}")
async def get_comments(video_id: str, limit: int = 50) -> dict[str, Any]:
    """Get comments for a video."""
    engine = _get_engine()
    return {"comments": await engine.get_comments(video_id, limit)}


@router.post("/subscribe/{creator_id}")
async def subscribe(creator_id: str, body: dict[str, Any]) -> dict[str, Any]:
    """Subscribe to a creator."""
    engine = _get_engine()
    user_id = body.get("user_id", "default")
    return await engine.subscribe(user_id, creator_id)


@router.delete("/subscribe/{creator_id}")
async def unsubscribe(creator_id: str, user_id: str = "default") -> dict[str, Any]:
    """Unsubscribe from a creator."""
    engine = _get_engine()
    return await engine.unsubscribe(user_id, creator_id)


@router.get("/channel/{creator_id}")
async def get_channel(creator_id: str) -> dict[str, Any]:
    """Get a creator's channel page."""
    engine = _get_engine()
    return await engine.get_channel(creator_id)


@router.get("/analytics")
async def get_analytics(creator_id: str = "default") -> dict[str, Any]:
    """Get creator analytics."""
    engine = _get_engine()
    return await engine.get_analytics(creator_id)


@router.post("/history/{video_id}")
async def record_history(video_id: str, body: dict[str, Any]) -> dict[str, Any]:
    """Record watch history entry."""
    engine = _get_engine()
    user_id = body.get("user_id", "default")
    watch_percent = body.get("watch_percent", 0)
    await engine.record_watch_history(user_id, video_id, watch_percent)
    return {"recorded": True}


@router.get("/history")
async def get_history(user_id: str = "default", limit: int = 50) -> dict[str, Any]:
    """Get watch history."""
    engine = _get_engine()
    return {"history": await engine.get_watch_history(user_id, limit)}


@router.get("/stats")
async def get_stats() -> dict[str, Any]:
    """Get SoulTube engine stats."""
    engine = _get_engine()
    return engine.get_stats()
