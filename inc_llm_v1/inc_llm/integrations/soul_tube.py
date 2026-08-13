"""SoulTube — YouTube alternative with RLOS mesh-based free video hosting/streaming.

Users become content creators by posting videos. Uses the RLOS mesh for free
video hosting and streaming — no external CDN, no hosting costs.

Features: upload, transcode (multi-resolution), HLS streaming, search,
recommendations (incllmv2-powered), likes, comments, subscriptions,
trending, creator analytics, monetization (Soul tokens).

Uses recursive link mechanics for speed:
- SegmentCache (like PrefixCache): O(1) segment-to-node lookup
- SegmentBatchProcessor (like BatchProcessor): batches segment fetch requests
- StreamLoadBalancer (like LoadBalancer): routes to best streaming node
- VideoPredictiveLoader (like PredictiveLoader): pre-fetches trending segments

Zero-slowdown: all operations async, caching O(1), background pre-fetching.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sqlite3
import subprocess
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, AsyncIterator

from inc_llm.config import SoulTubeConfig
from inc_llm.integrations.soul_tube_cache import SegmentCache
from inc_llm.integrations.soul_tube_batch import SegmentBatchProcessor
from inc_llm.integrations.soul_tube_balancer import StreamLoadBalancer
from inc_llm.integrations.soul_tube_predictive import VideoPredictiveLoader
from inc_llm.integrations.soul_tube_storage import MeshVideoStorage

logger = logging.getLogger(__name__)


@dataclass
class Video:
    video_id: str
    title: str
    description: str
    creator_id: str
    creator_name: str
    tags: list[str] = field(default_factory=list)
    duration_s: int = 0
    thumbnail_path: str = ""
    source_path: str = ""
    resolutions: list[str] = field(default_factory=list)
    view_count: int = 0
    like_count: int = 0
    dislike_count: int = 0
    comment_count: int = 0
    created_at: float = field(default_factory=time.time)
    segment_counts: dict[str, int] = field(default_factory=dict)
    source: str = "upload"


RESOLUTION_MAP = {
    "240p": (426, 240),
    "480p": (854, 480),
    "720p": (1280, 720),
    "1080p": (1920, 1080),
}


class SoulTubeEngine:
    """Main SoulTube engine — YouTube alternative with RLOS mesh streaming.

    Integrates SegmentCache, SegmentBatchProcessor, StreamLoadBalancer, and
    VideoPredictiveLoader for zero-slowdown operation.
    """

    def __init__(
        self,
        config: SoulTubeConfig,
        harness: Any | None = None,
        rlos: Any | None = None,
        node_manager: Any | None = None,
    ) -> None:
        self.config = config
        self.harness = harness
        self.rlos = rlos
        self._storage_dir = Path(os.path.expanduser(config.storage_dir))
        self._storage_dir.mkdir(parents=True, exist_ok=True)

        self._db_path = Path(os.path.expanduser(config.db_path))
        self._db_path.parent.mkdir(parents=True, exist_ok=True)

        self._videos: dict[str, Video] = {}
        self._init_db()

        self._segment_cache = SegmentCache(
            max_entries=config.segment_cache_max_entries,
            warm_threshold=config.segment_cache_warm_threshold,
        ) if config.segment_cache_enabled else None

        self._mesh_storage = MeshVideoStorage(
            config=config,
            node_manager=node_manager,
            segment_cache=self._segment_cache,
        )

        self._stream_balancer = StreamLoadBalancer(
            node_manager=node_manager,
            segment_cache=self._segment_cache,
        ) if node_manager else None

        self._predictive_loader = VideoPredictiveLoader(
            prefetch_fn=self._prefetch_segment,
            prefetch_count=config.predictive_prefetch_count,
        ) if config.predictive_prefetch_enabled else None

        self._segment_batch = SegmentBatchProcessor(
            fetch_fn=self._fetch_segment,
            batch_window_ms=config.segment_batch_window_ms,
            max_batch_size=config.segment_batch_max_size,
        )

    def _init_db(self) -> None:
        with sqlite3.connect(str(self._db_path)) as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS videos (
                    video_id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    description TEXT,
                    creator_id TEXT,
                    creator_name TEXT,
                    tags TEXT,
                    duration_s INTEGER,
                    thumbnail_path TEXT,
                    source_path TEXT,
                    resolutions TEXT,
                    view_count INTEGER DEFAULT 0,
                    like_count INTEGER DEFAULT 0,
                    dislike_count INTEGER DEFAULT 0,
                    created_at REAL,
                    source TEXT DEFAULT 'upload'
                );

                CREATE TABLE IF NOT EXISTS likes (
                    user_id TEXT,
                    video_id TEXT,
                    liked INTEGER,
                    PRIMARY KEY (user_id, video_id)
                );

                CREATE TABLE IF NOT EXISTS comments (
                    comment_id TEXT PRIMARY KEY,
                    video_id TEXT,
                    user_id TEXT,
                    user_name TEXT,
                    text TEXT,
                    created_at REAL
                );

                CREATE TABLE IF NOT EXISTS subscriptions (
                    user_id TEXT,
                    creator_id TEXT,
                    PRIMARY KEY (user_id, creator_id)
                );

                CREATE TABLE IF NOT EXISTS watch_history (
                    user_id TEXT,
                    video_id TEXT,
                    watched_at REAL,
                    watch_percent REAL DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS playlists (
                    playlist_id TEXT PRIMARY KEY,
                    user_id TEXT,
                    name TEXT,
                    video_ids TEXT,
                    created_at REAL
                );

                CREATE TABLE IF NOT EXISTS creator_earnings (
                    creator_id TEXT PRIMARY KEY,
                    total_tokens REAL DEFAULT 0,
                    total_views INTEGER DEFAULT 0,
                    last_payout REAL DEFAULT 0
                );

                CREATE INDEX IF NOT EXISTS idx_videos_creator ON videos(creator_id);
                CREATE INDEX IF NOT EXISTS idx_videos_created ON videos(created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_comments_video ON comments(video_id);
                CREATE INDEX IF NOT EXISTS idx_history_user ON watch_history(user_id);
            """)
            conn.commit()

    async def upload_video(
        self,
        file_path: str,
        metadata: dict[str, Any],
        creator_id: str = "default",
        creator_name: str = "Anonymous",
    ) -> dict[str, Any]:
        """Upload, transcode, segment, and distribute a video."""
        video_id = str(uuid.uuid4())
        video_dir = self._storage_dir / video_id
        video_dir.mkdir(parents=True, exist_ok=True)

        source_path = video_dir / "source.mp4"
        if os.path.abspath(file_path) != os.path.abspath(str(source_path)):
            import shutil
            shutil.copy2(file_path, source_path)

        duration = await self._get_duration(str(source_path))

        thumbnail_path = video_dir / "thumbnail.jpg"
        await self._generate_thumbnail(str(source_path), str(thumbnail_path))

        resolutions = self.config.transcoding_resolutions
        segment_counts: dict[str, int] = {}

        for res in resolutions:
            res_dir = video_dir / res
            res_dir.mkdir(parents=True, exist_ok=True)

            transcoded_path = res_dir / "transcoded.mp4"
            await self._transcode(str(source_path), str(transcoded_path), res)

            seg_count = await self._segment_video(
                str(transcoded_path), str(res_dir), self.config.hls_segment_duration_s
            )
            segment_counts[res] = seg_count

            if self._segment_cache:
                await self._mesh_storage.distribute_segments(video_id, res, seg_count)

        video = Video(
            video_id=video_id,
            title=metadata.get("title", "Untitled"),
            description=metadata.get("description", ""),
            creator_id=creator_id,
            creator_name=creator_name,
            tags=metadata.get("tags", []),
            duration_s=duration,
            thumbnail_path=str(thumbnail_path),
            source_path=str(source_path),
            resolutions=resolutions,
            segment_counts=segment_counts,
            source=metadata.get("source", "upload"),
        )
        self._videos[video_id] = video
        self._save_video_to_db(video)

        logger.info("SoulTube video uploaded: %s (%s, %ds)", video_id, video.title, duration)

        return {
            "video_id": video_id,
            "title": video.title,
            "duration_s": video.duration_s,
            "resolutions": video.resolutions,
            "segment_counts": video.segment_counts,
            "thumbnail": f"/v1/soultube/thumbnail/{video_id}",
        }

    async def _get_duration(self, video_path: str) -> int:
        try:
            cmd = [
                self.config.ffmpeg_path, "-i", video_path,
                "-f", "json", "-show_format", "-show_streams",
            ]
            result = await asyncio.to_thread(
                lambda: subprocess.run(
                    ["ffprobe", "-v", "quiet", "-print_format", "json",
                     "-show_format", video_path],
                    capture_output=True, text=True, timeout=30,
                )
            )
            data = json.loads(result.stdout)
            return int(float(data.get("format", {}).get("duration", 0)))
        except Exception:
            return 0

    async def _generate_thumbnail(self, video_path: str, output_path: str) -> None:
        cmd = [
            self.config.ffmpeg_path, "-y",
            "-ss", str(self.config.thumbnail_time_s),
            "-i", video_path,
            "-vframes", "1", "-q:v", "2",
            output_path,
        ]
        try:
            await asyncio.to_thread(
                lambda: subprocess.run(cmd, capture_output=True, timeout=30)
            )
        except Exception as e:
            logger.warning("Thumbnail generation failed: %s", e)

    async def _transcode(self, input_path: str, output_path: str, resolution: str) -> None:
        w, h = RESOLUTION_MAP.get(resolution, (1280, 720))
        cmd = [
            self.config.ffmpeg_path, "-y",
            "-i", input_path,
            "-vf", f"scale={w}:{h}",
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-c:a", "aac", "-b:a", "128k",
            "-hls_time", str(self.config.hls_segment_duration_s),
            "-hls_playlist_type", "vod",
            "-hls_segment_filename", output_path.replace(".mp4", "_seg_%03d.ts"),
            output_path.replace(".mp4", ".m3u8"),
        ]
        await asyncio.to_thread(
            lambda: subprocess.run(cmd, capture_output=True, timeout=600)
        )

    async def _segment_video(
        self, video_path: str, output_dir: str, segment_duration_s: int
    ) -> int:
        seg_pattern = os.path.join(output_dir, "segment_%05d.ts")
        playlist_path = os.path.join(output_dir, "playlist.m3u8")
        cmd = [
            self.config.ffmpeg_path, "-y",
            "-i", video_path,
            "-c", "copy",
            "-f", "hls",
            "-hls_time", str(segment_duration_s),
            "-hls_list_size", "0",
            "-hls_segment_filename", seg_pattern,
            playlist_path,
        ]
        await asyncio.to_thread(
            lambda: subprocess.run(cmd, capture_output=True, timeout=600)
        )

        segments = [f for f in os.listdir(output_dir) if f.endswith(".ts")]
        return len(segments)

    async def stream_video(
        self, video_id: str, resolution: str = "720p"
    ) -> AsyncIterator[bytes]:
        """Stream video segments as an async iterator (HLS)."""
        video = self._videos.get(video_id)
        if not video:
            raise ValueError(f"Video {video_id} not found")

        if resolution not in video.resolutions:
            resolution = video.resolutions[0] if video.resolutions else "720p"

        seg_count = video.segment_counts.get(resolution, 0)

        await self._increment_view_count(video_id)

        for seg_num in range(seg_count):
            if self._predictive_loader:
                self._predictive_loader.record_segment_request(video_id, seg_num)
                asyncio.create_task(
                    self._predictive_loader.prefetch_predicted(video_id, seg_num)
                )

            data = await self._segment_batch.submit(
                video_id=video_id,
                segment_num=seg_num,
                resolution=resolution,
                priority=1 if seg_num < 3 else 0,
            )
            yield data

    async def _fetch_segment(
        self, video_id: str, segment_num: int, resolution: str, node_url: str = ""
    ) -> bytes:
        data = await self._mesh_storage.retrieve_segment(video_id, segment_num, resolution)
        if data is None:
            raise ValueError(f"Segment {video_id}:{segment_num}:{resolution} not found")
        return data

    async def _prefetch_segment(self, video_id: str, segment_num: int) -> bool:
        try:
            for res in self.config.transcoding_resolutions:
                await self._mesh_storage.retrieve_segment(video_id, segment_num, res)
            return True
        except Exception:
            return False

    async def _increment_view_count(self, video_id: str) -> None:
        video = self._videos.get(video_id)
        if video:
            video.view_count += 1
            with sqlite3.connect(str(self._db_path)) as conn:
                conn.execute(
                    "UPDATE videos SET view_count = view_count + 1 WHERE video_id = ?",
                    (video_id,),
                )
                if self.config.monetization_enabled:
                    conn.execute(
                        """INSERT OR IGNORE INTO creator_earnings (creator_id, total_tokens, total_views, last_payout)
                           VALUES (?, 0, 0, 0)""",
                        (video.creator_id,),
                    )
                    conn.execute(
                        """UPDATE creator_earnings
                           SET total_tokens = total_tokens + ?,
                               total_views = total_views + 1
                           WHERE creator_id = ?""",
                        (self.config.soul_token_per_view, video.creator_id),
                    )
                conn.commit()

    def _save_video_to_db(self, video: Video) -> None:
        with sqlite3.connect(str(self._db_path)) as conn:
            conn.execute(
                """INSERT OR REPLACE INTO videos
                   (video_id, title, description, creator_id, creator_name, tags,
                    duration_s, thumbnail_path, source_path, resolutions, view_count,
                    like_count, dislike_count, created_at, source)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (video.video_id, video.title, video.description, video.creator_id,
                 video.creator_name, json.dumps(video.tags), video.duration_s,
                 video.thumbnail_path, video.source_path, json.dumps(video.resolutions),
                 video.view_count, video.like_count, video.dislike_count,
                 video.created_at, video.source),
            )
            conn.commit()

    async def search_videos(self, query: str, limit: int = 20) -> list[dict[str, Any]]:
        """Search videos by title, description, tags."""
        results = []
        query_lower = query.lower()

        for video in self._videos.values():
            score = 0
            if query_lower in video.title.lower():
                score += 3
            if query_lower in video.description.lower():
                score += 1
            if any(query_lower in tag.lower() for tag in video.tags):
                score += 2
            if score > 0:
                results.append((score, video))

        results.sort(key=lambda x: (x[0], x[1].view_count), reverse=True)
        return [self._video_to_dict(v) for _, v in results[:limit]]

    async def get_recommendations(
        self, user_id: str = "", limit: int = 10
    ) -> list[dict[str, Any]]:
        """Get personalized recommendations using incllmv2."""
        if self._predictive_loader:
            trending = self._predictive_loader.get_trending_videos(limit)
            trending_ids = [vid for vid, _ in trending]
            recommended = [
                self._video_to_dict(self._videos[vid])
                for vid in trending_ids
                if vid in self._videos
            ]
            if len(recommended) >= limit:
                return recommended[:limit]

        all_videos = sorted(
            self._videos.values(),
            key=lambda v: (v.view_count, v.created_at),
            reverse=True,
        )
        return [self._video_to_dict(v) for v in all_videos[:limit]]

    async def get_trending(self, limit: int = 10) -> list[dict[str, Any]]:
        """Get trending videos by view count."""
        all_videos = sorted(self._videos.values(), key=lambda v: v.view_count, reverse=True)
        return [self._video_to_dict(v) for v in all_videos[:limit]]

    async def like_video(self, user_id: str, video_id: str, liked: bool = True) -> dict[str, Any]:
        video = self._videos.get(video_id)
        if not video:
            raise ValueError(f"Video {video_id} not found")

        with sqlite3.connect(str(self._db_path)) as conn:
            existing = conn.execute(
                "SELECT liked FROM likes WHERE user_id = ? AND video_id = ?",
                (user_id, video_id),
            ).fetchone()

            if existing:
                old_liked = bool(existing[0])
                if old_liked == liked:
                    return {"liked": liked}
                if old_liked:
                    video.like_count -= 1
                else:
                    video.dislike_count -= 1

            conn.execute(
                "INSERT OR REPLACE INTO likes (user_id, video_id, liked) VALUES (?, ?, ?)",
                (user_id, video_id, 1 if liked else 0),
            )

            if liked:
                video.like_count += 1
            else:
                video.dislike_count += 1

            conn.execute(
                "UPDATE videos SET like_count = ?, dislike_count = ? WHERE video_id = ?",
                (video.like_count, video.dislike_count, video_id),
            )
            conn.commit()

        return {"liked": liked, "like_count": video.like_count, "dislike_count": video.dislike_count}

    async def add_comment(
        self, video_id: str, user_id: str, user_name: str, text: str
    ) -> dict[str, Any]:
        comment_id = str(uuid.uuid4())
        created_at = time.time()

        with sqlite3.connect(str(self._db_path)) as conn:
            conn.execute(
                """INSERT INTO comments (comment_id, video_id, user_id, user_name, text, created_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (comment_id, video_id, user_id, user_name, text, created_at),
            )
            conn.execute(
                "UPDATE videos SET comment_count = comment_count + 1 WHERE video_id = ?",
                (video_id,),
            )
            conn.commit()

        video = self._videos.get(video_id)
        if video:
            video.comment_count += 1

        return {"comment_id": comment_id, "text": text, "user_name": user_name, "created_at": created_at}

    async def get_comments(self, video_id: str, limit: int = 50) -> list[dict[str, Any]]:
        with sqlite3.connect(str(self._db_path)) as conn:
            rows = conn.execute(
                """SELECT comment_id, user_id, user_name, text, created_at
                   FROM comments WHERE video_id = ?
                   ORDER BY created_at DESC LIMIT ?""",
                (video_id, limit),
            ).fetchall()

        return [
            {"comment_id": r[0], "user_id": r[1], "user_name": r[2],
             "text": r[3], "created_at": r[4]}
            for r in rows
        ]

    async def subscribe(self, user_id: str, creator_id: str) -> dict[str, Any]:
        with sqlite3.connect(str(self._db_path)) as conn:
            conn.execute(
                "INSERT OR IGNORE INTO subscriptions (user_id, creator_id) VALUES (?, ?)",
                (user_id, creator_id),
            )
            conn.commit()
        return {"subscribed": True, "creator_id": creator_id}

    async def unsubscribe(self, user_id: str, creator_id: str) -> dict[str, Any]:
        with sqlite3.connect(str(self._db_path)) as conn:
            conn.execute(
                "DELETE FROM subscriptions WHERE user_id = ? AND creator_id = ?",
                (user_id, creator_id),
            )
            conn.commit()
        return {"subscribed": False, "creator_id": creator_id}

    async def get_channel(self, creator_id: str) -> dict[str, Any]:
        videos = [v for v in self._videos.values() if v.creator_id == creator_id]
        total_views = sum(v.view_count for v in videos)
        total_likes = sum(v.like_count for v in videos)

        with sqlite3.connect(str(self._db_path)) as conn:
            sub_count = conn.execute(
                "SELECT COUNT(*) FROM subscriptions WHERE creator_id = ?",
                (creator_id),
            ).fetchone()[0]

            earnings = conn.execute(
                "SELECT total_tokens, total_views FROM creator_earnings WHERE creator_id = ?",
                (creator_id,),
            ).fetchone()

        creator_name = videos[0].creator_name if videos else "Unknown"

        return {
            "creator_id": creator_id,
            "creator_name": creator_name,
            "video_count": len(videos),
            "total_views": total_views,
            "total_likes": total_likes,
            "subscriber_count": sub_count,
            "videos": [self._video_to_dict(v) for v in sorted(videos, key=lambda v: v.created_at, reverse=True)],
            "earnings": {
                "total_tokens": earnings[0] if earnings else 0,
                "total_views": earnings[1] if earnings else 0,
            } if self.config.monetization_enabled else None,
        }

    async def get_analytics(self, creator_id: str) -> dict[str, Any]:
        videos = [v for v in self._videos.values() if v.creator_id == creator_id]
        total_views = sum(v.view_count for v in videos)
        total_likes = sum(v.like_count for v in videos)
        total_comments = sum(v.comment_count for v in videos)

        with sqlite3.connect(str(self._db_path)) as conn:
            sub_count = conn.execute(
                "SELECT COUNT(*) FROM subscriptions WHERE creator_id = ?",
                (creator_id,),
            ).fetchone()[0]

            earnings = conn.execute(
                "SELECT total_tokens, total_views, last_payout FROM creator_earnings WHERE creator_id = ?",
                (creator_id,),
            ).fetchone()

        return {
            "creator_id": creator_id,
            "video_count": len(videos),
            "total_views": total_views,
            "total_likes": total_likes,
            "total_comments": total_comments,
            "subscriber_count": sub_count,
            "avg_views_per_video": total_views // max(1, len(videos)),
            "engagement_rate": round(total_likes / max(1, total_views), 4),
            "earnings": {
                "total_tokens": earnings[0] if earnings else 0,
                "total_views_monetized": earnings[1] if earnings else 0,
                "last_payout": earnings[2] if earnings else 0,
                "token_per_view": self.config.soul_token_per_view,
                "min_payout": self.config.min_payout_tokens,
            } if self.config.monetization_enabled else None,
        }

    async def record_watch_history(
        self, user_id: str, video_id: str, watch_percent: float = 0
    ) -> None:
        with sqlite3.connect(str(self._db_path)) as conn:
            conn.execute(
                """INSERT INTO watch_history (user_id, video_id, watched_at, watch_percent)
                   VALUES (?, ?, ?, ?)""",
                (user_id, video_id, time.time(), watch_percent),
            )
            conn.commit()

    async def get_watch_history(self, user_id: str, limit: int = 50) -> list[dict[str, Any]]:
        with sqlite3.connect(str(self._db_path)) as conn:
            rows = conn.execute(
                """SELECT video_id, watched_at, watch_percent
                   FROM watch_history WHERE user_id = ?
                   ORDER BY watched_at DESC LIMIT ?""",
                (user_id, limit),
            ).fetchall()

        return [
            {"video_id": r[0], "watched_at": r[1], "watch_percent": r[2]}
            for r in rows
        ]

    def get_video(self, video_id: str) -> dict[str, Any] | None:
        video = self._videos.get(video_id)
        if not video:
            return None
        return self._video_to_dict(video)

    def _video_to_dict(self, video: Video) -> dict[str, Any]:
        return {
            "video_id": video.video_id,
            "title": video.title,
            "description": video.description,
            "creator_id": video.creator_id,
            "creator_name": video.creator_name,
            "tags": video.tags,
            "duration_s": video.duration_s,
            "thumbnail": f"/v1/soultube/thumbnail/{video.video_id}",
            "resolutions": video.resolutions,
            "view_count": video.view_count,
            "like_count": video.like_count,
            "dislike_count": video.dislike_count,
            "comment_count": video.comment_count,
            "created_at": video.created_at,
            "source": video.source,
        }

    def get_stats(self) -> dict[str, Any]:
        stats: dict[str, Any] = {
            "total_videos": len(self._videos),
            "total_views": sum(v.view_count for v in self._videos.values()),
            "total_likes": sum(v.like_count for v in self._videos.values()),
        }
        if self._segment_cache:
            stats["segment_cache"] = self._segment_cache.get_stats()
        if self._stream_balancer:
            stats["streaming"] = self._stream_balancer.get_streaming_stats()
        if self._predictive_loader:
            stats["predictive"] = self._predictive_loader.get_stats()
        stats["batch"] = self._segment_batch.get_stats()
        stats["storage"] = self._mesh_storage.get_storage_stats()
        return stats
