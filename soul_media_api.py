"""
SoulMedia API — SoulMovies + SoulTube endpoints for Soulmate OS.
Standalone module using ffmpeg for video generation (CPU/clip assembly mode).
Integrates with the existing api_server.py via FastAPI APIRouter.
"""
from __future__ import annotations

import asyncio
import json
import os
import shutil
import sqlite3
import subprocess
import time
import uuid
import hashlib
import threading
import logging
import urllib.request
import urllib.parse
import urllib.error
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Request, UploadFile, File, Form
from fastapi.responses import FileResponse, JSONResponse

logger = logging.getLogger("soul_media")

router = APIRouter()

# === Paths ===
BASE_DIR = Path("/opt/incentives-wallet")
VIDEOS_DIR = BASE_DIR / "videos"
THUMBS_DIR = VIDEOS_DIR / "thumbnails"
UPLOADS_DIR = VIDEOS_DIR / "uploads"
DB_PATH = BASE_DIR / "soulmedia.db"

VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
THUMBS_DIR.mkdir(parents=True, exist_ok=True)
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

FFMPEG = "ffmpeg"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

# === Styles ===
STYLES = {
    "cinematic": {"color": "0a0a0f", "text_color": "ffffff", "music": "ambient"},
    "documentary": {"color": "1a1a2e", "text_color": "e0e0e0", "music": "soft"},
    "music video": {"color": "16213e", "text_color": "ff6b6b", "music": "beat"},
    "social media": {"color": "0f3460", "text_color": "53d769", "music": "upbeat"},
    "anime": {"color": "1a1a2e", "text_color": "e94560", "music": "anime"},
    "realistic": {"color": "2d3436", "text_color": "dfe6e9", "music": "natural"},
}

# === Database ===
def get_db():
    db = sqlite3.connect(str(DB_PATH))
    db.row_factory = sqlite3.Row
    return db

def init_db():
    db = get_db()
    db.executescript("""
        CREATE TABLE IF NOT EXISTS movies (
            project_id TEXT PRIMARY KEY,
            text_description TEXT NOT NULL,
            style TEXT DEFAULT 'cinematic',
            mode TEXT DEFAULT 'auto',
            resolution TEXT DEFAULT '1080p',
            duration_s INTEGER DEFAULT 35,
            status TEXT DEFAULT 'pending',
            progress REAL DEFAULT 0.0,
            output_path TEXT,
            thumbnail_path TEXT,
            created_at REAL DEFAULT 0,
            completed_at REAL DEFAULT 0,
            creator_id TEXT DEFAULT 'founder',
            creator_name TEXT DEFAULT 'Founder',
            views INTEGER DEFAULT 0,
            likes INTEGER DEFAULT 0,
            published INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS soultube_videos (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            creator_id TEXT DEFAULT 'founder',
            creator_name TEXT DEFAULT 'Founder',
            duration_s INTEGER DEFAULT 0,
            views INTEGER DEFAULT 0,
            likes INTEGER DEFAULT 0,
            file_path TEXT,
            thumbnail_path TEXT,
            resolution TEXT DEFAULT '720p',
            tags TEXT DEFAULT '',
            created_at REAL DEFAULT 0,
            category TEXT DEFAULT 'All'
        );
        CREATE TABLE IF NOT EXISTS comments (
            id TEXT PRIMARY KEY,
            video_id TEXT NOT NULL,
            user_name TEXT DEFAULT 'User',
            text TEXT NOT NULL,
            likes INTEGER DEFAULT 0,
            created_at REAL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS subscriptions (
            id TEXT PRIMARY KEY,
            subscriber_id TEXT,
            creator_id TEXT,
            created_at REAL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS watch_history (
            id TEXT PRIMARY KEY,
            user_id TEXT DEFAULT 'founder',
            video_id TEXT NOT NULL,
            watched_at REAL DEFAULT 0
        );
    """)
    db.commit()
    db.close()

init_db()

# === API Keys ===
POLLINATIONS_KEY_FILE = BASE_DIR / ".pollinations_key"
AGNES_KEY_FILE = BASE_DIR / ".agnes_key"

def _get_pollinations_key() -> Optional[str]:
    """Read Pollinations API key from file if it exists."""
    try:
        if POLLINATIONS_KEY_FILE.exists():
            return POLLINATIONS_KEY_FILE.read_text().strip()
    except:
        pass
    return None

def _get_agnes_key() -> Optional[str]:
    """Read Agnes AI API key from file if it exists."""
    try:
        if AGNES_KEY_FILE.exists():
            return AGNES_KEY_FILE.read_text().strip()
    except:
        pass
    return None

# === Style Modifiers ===
STYLE_MODIFIERS = {
    "cinematic": "cinematic, dramatic lighting, film still, movie quality, 4k, highly detailed",
    "documentary": "documentary style, natural lighting, realistic, professional photography",
    "music video": "vibrant colors, dynamic lighting, music video aesthetic, stylized, energetic",
    "social media": "bright, colorful, eye-catching, modern, social media style",
    "anime": "anime style, cel shaded, vibrant colors, studio quality, detailed background",
    "realistic": "photorealistic, ultra realistic, natural lighting, 8k, professional photo",
}

SHOT_TYPES = [
    "wide cinematic shot of",
    "dramatic close-up of",
    "aerial drone view of",
    "tracking shot of",
    "low angle shot of",
    "panoramic view of",
    "medium shot of",
    "overhead shot of",
]

def _enhance_scene_prompt(text: str, style: str, scene_num: int) -> str:
    """Enhance a scene prompt with style modifiers and shot types."""
    shot = SHOT_TYPES[scene_num % len(SHOT_TYPES)]
    modifier = STYLE_MODIFIERS.get(style, STYLE_MODIFIERS["cinematic"])
    return f"{shot} {text}, {modifier}"

# === Tier 0: Agnes AI — Real Motion Text-to-Video (free, cloud-based) ===
# Agnes AI generates actual video with motion (people walking, waves, etc.)
# Async API: POST /v1/videos to create task, then poll for result
# Free tier: $0/sec, 2 RPM, no GPU needed on our side
# Max 18s per clip, 720p/1080p, 16:9

AGNES_API_BASE = "https://apihub.agnes-ai.com"
AGNES_MAX_DURATION = 18  # seconds per clip
AGNES_MAX_FRAMES = 441   # must be <= 441 and follow 8n+1 rule

def _agnes_create_task(prompt: str, duration_s: int, width: int = 1280, height: int = 720) -> Optional[dict]:
    """Create an Agnes AI video generation task. Returns task info or None."""
    key = _get_agnes_key()
    if not key:
        return None
    
    # Calculate frames: 8n+1 rule, 24fps, clamp to max 441
    fps = 24
    target_frames = int(duration_s * fps)
    # Round to nearest 8n+1
    n = max(1, (target_frames - 1) // 8)
    num_frames = min(8 * n + 1, AGNES_MAX_FRAMES)
    actual_duration = num_frames / fps
    
    payload = json.dumps({
        "model": "agnes-video-v2.0",
        "prompt": prompt,
        "width": width,
        "height": height,
        "num_frames": num_frames,
        "frame_rate": fps,
    })
    
    try:
        req = urllib.request.Request(
            f"{AGNES_API_BASE}/v1/videos",
            data=payload.encode("utf-8"),
            method="POST"
        )
        req.add_header("Authorization", f"Bearer {key}")
        req.add_header("Content-Type", "application/json")
        
        logger.info(f"Tier 0 (Agnes): Creating video task for: {prompt[:80]}")
        with urllib.request.urlopen(req, timeout=30) as resp:
            if resp.status != 200:
                logger.warning(f"Tier 0: Create returned status {resp.status}")
                return None
            data = json.loads(resp.read().decode())
            logger.info(f"Tier 0: Task created: {data}")
            return data
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        logger.warning(f"Tier 0: HTTP error {e.code}: {e.reason} - {body[:200]}")
        return None
    except Exception as e:
        logger.warning(f"Tier 0: Create failed: {e}")
        return None

def _agnes_poll_task(video_id: str, max_wait: int = 300) -> Optional[str]:
    """Poll Agnes AI for video result. Returns video URL or None."""
    key = _get_agnes_key()
    if not key:
        return None
    
    start = time.time()
    poll_interval = 5  # seconds
    
    while time.time() - start < max_wait:
        try:
            url = f"{AGNES_API_BASE}/agnesapi?video_id={video_id}"
            req = urllib.request.Request(url)
            req.add_header("Authorization", f"Bearer {key}")
            
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode())
                status = data.get("status", "").lower()
                
                if status in ("succeeded", "success", "completed", "complete"):
                    # Try multiple possible URL fields
                    video_url = (
                        data.get("video_url") or
                        data.get("url") or
                        data.get("download_url") or
                        data.get("output_url") or
                        ""
                    )
                    if not video_url and isinstance(data.get("output"), dict):
                        video_url = data["output"].get("video_url") or data["output"].get("url") or ""
                    if not video_url and isinstance(data.get("data"), dict):
                        video_url = data["data"].get("video_url") or data["data"].get("url") or ""
                    if not video_url:
                        # Check for direct video data
                        if data.get("video"):
                            return data.get("video")
                    if video_url:
                        logger.info(f"Tier 0: Video ready at {video_url[:80]}")
                        return video_url
                    logger.warning(f"Tier 0: Completed but no video URL in: {json.dumps(data)[:300]}")
                    return None
                elif status in ("failed", "error"):
                    logger.warning(f"Tier 0: Task failed: {data}")
                    return None
                else:
                    # Still processing/queued
                    elapsed = int(time.time() - start)
                    logger.info(f"Tier 0: Polling {video_id} - {status} ({elapsed}s)")
            
        except Exception as e:
            logger.warning(f"Tier 0: Poll error: {e}")
        
        time.sleep(poll_interval)
    
    logger.warning(f"Tier 0: Timed out after {max_wait}s for {video_id}")
    return None

def _agnes_download_video(video_url: str, output_path: str) -> bool:
    """Download a video from a URL to a local file."""
    try:
        req = urllib.request.Request(video_url)
        req.add_header("User-Agent", "SoulmateOS/1.0")
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = resp.read()
            if len(data) < 1000:
                logger.warning(f"Tier 0: Download too small: {len(data)} bytes")
                return False
            with open(output_path, "wb") as f:
                f.write(data)
            logger.info(f"Tier 0: Video downloaded ({len(data)} bytes)")
            return True
    except Exception as e:
        logger.warning(f"Tier 0: Download failed: {e}")
        return False

def _try_agnes_video(prompt: str, duration_s: int, output_path: str, max_retries: int = 3) -> bool:
    """Full Agnes AI flow: create task → poll → download. Returns True on success.
    Retries on queue full (503) errors with backoff."""
    for attempt in range(max_retries):
        task = _agnes_create_task(prompt, duration_s)
        if not task:
            if attempt < max_retries - 1:
                wait = 30 * (attempt + 1)
                logger.info(f"Tier 0: Retrying in {wait}s (attempt {attempt + 2}/{max_retries})")
                time.sleep(wait)
                continue
            return False
        
        video_id = task.get("video_id") or task.get("id")
        if not video_id:
            video_url = task.get("video_url") or task.get("url", "")
            if video_url:
                return _agnes_download_video(video_url, output_path)
            logger.warning(f"Tier 0: No video_id in response: {task}")
            return False
        
        video_url = _agnes_poll_task(video_id, max_wait=300)
        if not video_url:
            if attempt < max_retries - 1:
                wait = 30 * (attempt + 1)
                logger.info(f"Tier 0: Retrying in {wait}s (attempt {attempt + 2}/{max_retries})")
                time.sleep(wait)
                continue
            return False
        
        return _agnes_download_video(video_url, output_path)
    
    return False

def _generate_tier0_video(project_id: str, description: str, style: str,
                           duration_s: int, resolution: str, db) -> Optional[str]:
    """Tier 0: Generate real motion video using Agnes AI. Returns output path or None."""
    key = _get_agnes_key()
    if not key:
        logger.info("Tier 0: No Agnes API key, skipping")
        return None
    
    w, h = (1280, 720) if resolution == "720p" else (1280, 720)  # Agnes works best at 720p
    
    # Split into scenes of max 18 seconds each
    scene_duration = min(AGNES_MAX_DURATION, duration_s)
    num_scenes = max(1, duration_s // scene_duration)
    if duration_s % scene_duration > 0:
        num_scenes += 1
    
    # Create scene prompts
    words = description.split()
    words_per_scene = max(5, len(words) // num_scenes)
    scenes = []
    for i in range(num_scenes):
        start = i * words_per_scene
        end = start + words_per_scene
        scene_text = " ".join(words[start:end]) if start < len(words) else description
        if not scene_text:
            scene_text = description
        enhanced = _enhance_scene_prompt(scene_text, style, i)
        scenes.append(enhanced)
    
    project_dir = VIDEOS_DIR / project_id
    project_dir.mkdir(exist_ok=True)
    
    scene_clips = []
    videos_generated = 0
    
    for i, scene_prompt in enumerate(scenes):
        progress = 0.05 + (i / num_scenes) * 0.8
        db.execute("UPDATE movies SET status='generating video (Agnes AI)', progress=? WHERE project_id=?", (progress, project_id))
        db.commit()
        
        dur = min(scene_duration, duration_s - i * scene_duration)
        if dur <= 0:
            dur = scene_duration
        
        clip_path = str(project_dir / f"clip_{i:03d}.mp4")
        
        # Rate limit: Agnes free tier = 2 RPM (1 effective)
        if i > 0:
            logger.info(f"Tier 0: Waiting 60s for rate limit before scene {i}")
            time.sleep(60)
        
        ok = _try_agnes_video(scene_prompt, dur, clip_path)
        if ok and os.path.exists(clip_path):
            videos_generated += 1
            scene_clips.append(clip_path)
            logger.info(f"Tier 0: Scene {i}/{num_scenes} generated successfully")
        else:
            logger.warning(f"Tier 0: Scene {i} failed, will use fallback")
            # Try Pollinations video API as backup for this scene
            ok2 = _try_pollinations_video(scene_prompt, dur, clip_path)
            if ok2 and os.path.exists(clip_path):
                videos_generated += 1
                scene_clips.append(clip_path)
            else:
                # Fall back to Ken Burns image for this scene
                img_path = str(project_dir / f"scene_{i:03d}.jpg")
                seed = hash(description) % 999999 + i * 1000
                if _download_ai_image(scene_prompt, img_path, 1920, 1080, seed):
                    _image_to_ken_burns_clip(img_path, dur, clip_path, i, 1920, 1080)
                else:
                    _generate_solid_clip(scene_prompt, style, dur, clip_path, 1920, 1080)
                scene_clips.append(clip_path)
    
    if videos_generated == 0:
        logger.warning("Tier 0: No Agnes videos generated")
        try:
            shutil.rmtree(project_dir)
        except:
            pass
        return None
    
    # Stitch clips
    db.execute("UPDATE movies SET status='finalizing', progress=0.9 WHERE project_id=?", (project_id,))
    db.commit()
    
    output_path = str(VIDEOS_DIR / f"{project_id}.mp4")
    _stitch_clips(scene_clips, output_path)
    
    try:
        shutil.rmtree(project_dir)
    except:
        pass
    
    return output_path

# === Tier 1: Pollinations Video API (fallback if Agnes unavailable) ===

def _try_pollinations_video(prompt: str, duration_s: int, output_path: str) -> bool:
    """Try Pollinations.ai direct text-to-video API. Returns True on success."""
    key = _get_pollinations_key()
    if not key:
        return False
    
    api_duration = min(duration_s, 15)
    model = "wan"  # 2-15s
    
    encoded_prompt = urllib.parse.quote(prompt)
    url = f"https://gen.pollinations.ai/video/{encoded_prompt}?model={model}&duration={api_duration}&aspectRatio=16:9&width=1920&height=1080"
    
    try:
        req = urllib.request.Request(url)
        req.add_header("Authorization", f"Bearer {key}")
        req.add_header("User-Agent", "SoulmateOS/1.0")
        
        logger.info(f"Tier 1: Calling Pollinations video API for: {prompt[:80]}")
        with urllib.request.urlopen(req, timeout=180) as resp:
            if resp.status != 200:
                return False
            data = resp.read()
            if len(data) < 1000:
                return False
            with open(output_path, "wb") as f:
                f.write(data)
            logger.info(f"Tier 1: Video downloaded ({len(data)} bytes)")
            return True
    except Exception as e:
        logger.warning(f"Tier 1: Failed: {e}")
        return False

# === Tier 2: AI Images + ffmpeg Ken Burns ===

def _download_ai_image(prompt: str, output_path: str, width: int = 1920, height: int = 1080, seed: int = 0) -> bool:
    """Download an AI-generated image from Pollinations.ai (legacy, no key needed)."""
    encoded = urllib.parse.quote(prompt)
    url = f"https://image.pollinations.ai/prompt/{encoded}?model=flux&width={width}&height={height}&seed={seed}&nologo=true"
    
    try:
        req = urllib.request.Request(url)
        req.add_header("User-Agent", "SoulmateOS/1.0")
        
        logger.info(f"Tier 2: Downloading AI image for: {prompt[:60]}")
        with urllib.request.urlopen(req, timeout=90) as resp:
            if resp.status != 200:
                return False
            data = resp.read()
            if len(data) < 500:
                return False
            with open(output_path, "wb") as f:
                f.write(data)
            logger.info(f"Tier 2: Image downloaded ({len(data)} bytes)")
            return True
    except Exception as e:
        logger.warning(f"Tier 2: Image download failed: {e}")
        return False

def _image_to_ken_burns_clip(image_path: str, duration: float, output_path: str, 
                              scene_num: int, width: int = 1920, height: int = 1080) -> bool:
    """Convert an image to a video clip with Ken Burns zoom/pan effect."""
    fps = 25
    total_frames = int(duration * fps)
    
    # Alternate between zoom-in, zoom-out, and pan
    effect = scene_num % 3
    
    if effect == 0:
        # Zoom in to center
        zf = f"scale=8000:-1,zoompan=z='min(zoom+0.001,{1.5})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={total_frames}:s={width}x{height}:fps={fps}"
    elif effect == 1:
        # Zoom out from center
        zf = f"scale=8000:-1,zoompan=z='if(lte(zoom,1.0),1.5,max(1.001,zoom-0.001))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={total_frames}:s={width}x{height}:fps={fps}"
    else:
        # Pan left to right
        zf = f"scale=-1:{height * 2},zoompan=z='1':x='(iw-iw/zoom)*on/{total_frames}':y='ih/2-(ih/zoom/2)':d={total_frames}:s={width}x{height}:fps={fps}"
    
    cmd = [
        FFMPEG, "-y",
        "-loop", "1", "-i", image_path,
        "-vf", zf,
        "-c:v", "libx264", "-preset", "fast", "-crf", "26",
        "-pix_fmt", "yuv420p",
        "-t", str(duration),
        output_path
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=120)
        if result.returncode == 0 and os.path.exists(output_path):
            return True
        # Fallback: simple scale without zoompan
        cmd2 = [FFMPEG, "-y", "-loop", "1", "-i", image_path,
                "-vf", f"scale={width}:{height}",
                "-c:v", "libx264", "-preset", "fast", "-crf", "28",
                "-pix_fmt", "yuv420p", "-t", str(duration), output_path]
        result2 = subprocess.run(cmd2, capture_output=True, timeout=60)
        return result2.returncode == 0
    except Exception as e:
        logger.error(f"Ken Burns clip failed: {e}")
        return False

def _generate_tier2_video(project_id: str, description: str, style: str,
                           duration_s: int, resolution: str, db) -> Optional[str]:
    """Tier 2: Generate video using AI images + ffmpeg Ken Burns. Returns output path or None."""
    w, h = (1920, 1080) if resolution == "1080p" else (1280, 720)
    
    # Split into scenes
    scene_duration = min(10, duration_s)
    num_scenes = max(1, duration_s // scene_duration)
    if duration_s % scene_duration > 0:
        num_scenes += 1
    
    # Create scene prompts
    words = description.split()
    words_per_scene = max(5, len(words) // num_scenes)
    scenes = []
    for i in range(num_scenes):
        start = i * words_per_scene
        end = start + words_per_scene
        scene_text = " ".join(words[start:end]) if start < len(words) else description
        if not scene_text:
            scene_text = description
        enhanced = _enhance_scene_prompt(scene_text, style, i)
        scenes.append(enhanced)
    
    project_dir = VIDEOS_DIR / project_id
    project_dir.mkdir(exist_ok=True)
    
    scene_clips = []
    images_generated = 0
    
    for i, scene_prompt in enumerate(scenes):
        progress = 0.1 + (i / num_scenes) * 0.5
        db.execute("UPDATE movies SET status='generating images', progress=? WHERE project_id=?", (progress, project_id))
        db.commit()
        
        dur = min(scene_duration, duration_s - i * scene_duration)
        if dur <= 0:
            dur = scene_duration
        
        # Download AI image
        img_path = str(project_dir / f"scene_{i:03d}.jpg")
        seed = hash(description) % 999999 + i * 1000
        img_ok = _download_ai_image(scene_prompt, img_path, w, h, seed)
        
        if img_ok:
            images_generated += 1
            # Rate limit: wait between requests
            if i < num_scenes - 1:
                time.sleep(3)
            
            # Convert image to Ken Burns clip
            clip_path = str(project_dir / f"clip_{i:03d}.mp4")
            clip_ok = _image_to_ken_burns_clip(img_path, dur, clip_path, i, w, h)
            if clip_ok:
                scene_clips.append(clip_path)
                continue
        
        # Fallback to solid color clip for this scene
        logger.warning(f"Tier 2: Scene {i} fell back to solid color")
        clip_path = str(project_dir / f"clip_{i:03d}.mp4")
        _generate_solid_clip(scene_prompt, style, dur, clip_path, w, h)
        scene_clips.append(clip_path)
    
    if images_generated == 0:
        logger.warning("Tier 2: No images generated, returning None for tier 3 fallback")
        try:
            shutil.rmtree(project_dir)
        except:
            pass
        return None
    
    # Stitch clips
    db.execute("UPDATE movies SET status='finalizing', progress=0.85 WHERE project_id=?", (project_id,))
    db.commit()
    
    output_path = str(VIDEOS_DIR / f"{project_id}.mp4")
    _stitch_clips(scene_clips, output_path)
    
    # Cleanup
    try:
        shutil.rmtree(project_dir)
    except:
        pass
    
    return output_path

# === Tier 3: Solid Color + Text (fallback) ===

def _generate_solid_clip(scene_text: str, style_name: str, duration: float,
                          output_path: str, width: int = 1920, height: int = 1080) -> bool:
    """Generate a solid color clip with text overlay (Tier 3 fallback)."""
    style = STYLES.get(style_name, STYLES["cinematic"])
    bg_color = style["color"]
    text_color = style["text_color"]
    
    words = scene_text.split()
    lines = []
    current = []
    for w in words:
        current.append(w)
        if len(" ".join(current)) > 40:
            lines.append(" ".join(current[:-1]))
            current = [w]
    if current:
        lines.append(" ".join(current))
    wrapped = "\\n".join(lines[:4])
    wrapped = wrapped.replace("'", "\\'").replace(":", "\\:").replace("%", "\\%")
    
    vf = f"scale={width}:{height},drawtext=fontfile={FONT}:text='{wrapped}':fontcolor=#{text_color}:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2:line_spacing=20"
    
    cmd = [
        FFMPEG, "-y",
        "-f", "lavfi", "-i", f"color=c=0x{bg_color}:s={width}x{height}:d={duration}:r=24",
        "-vf", vf,
        "-c:v", "libx264", "-preset", "fast", "-crf", "28",
        "-pix_fmt", "yuv420p", "-t", str(duration),
        output_path
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=120)
        return result.returncode == 0
    except:
        return False

def _generate_tier3_video(project_id: str, description: str, style: str,
                           duration_s: int, resolution: str, db) -> Optional[str]:
    """Tier 3: Generate video with solid color + text overlay. Always works."""
    w, h = (1920, 1080) if resolution == "1080p" else (1280, 720)
    
    scene_duration = min(10, duration_s)
    num_scenes = max(1, duration_s // scene_duration)
    if duration_s % scene_duration > 0:
        num_scenes += 1
    
    words = description.split()
    words_per_scene = max(5, len(words) // num_scenes)
    
    project_dir = VIDEOS_DIR / project_id
    project_dir.mkdir(exist_ok=True)
    
    scene_clips = []
    for i in range(num_scenes):
        db.execute("UPDATE movies SET status='rendering', progress=? WHERE project_id=?",
                  (0.1 + (i / num_scenes) * 0.7, project_id))
        db.commit()
        
        start = i * words_per_scene
        end = start + words_per_scene
        scene_text = " ".join(words[start:end]) if start < len(words) else description
        if not scene_text:
            scene_text = description
        
        dur = min(scene_duration, duration_s - i * scene_duration)
        if dur <= 0:
            dur = scene_duration
        
        clip_path = str(project_dir / f"clip_{i:03d}.mp4")
        _generate_solid_clip(scene_text, style, dur, clip_path, w, h)
        scene_clips.append(clip_path)
    
    db.execute("UPDATE movies SET status='finalizing', progress=0.85 WHERE project_id=?", (project_id,))
    db.commit()
    
    output_path = str(VIDEOS_DIR / f"{project_id}.mp4")
    _stitch_clips(scene_clips, output_path)
    
    try:
        shutil.rmtree(project_dir)
    except:
        pass
    
    return output_path

# === Shared helpers ===

def _generate_thumbnail(video_path: str, thumb_path: str, t: float = 1.0) -> bool:
    """Extract a thumbnail from the video."""
    cmd = [FFMPEG, "-y", "-i", video_path, "-ss", str(t), "-vframes", "1", "-q:v", "2", thumb_path]
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=30)
        return result.returncode == 0
    except:
        return False

def _stitch_clips(clip_paths: list, output_path: str) -> bool:
    """Stitch video clips together using ffmpeg concat (copy first, re-encode fallback)."""
    if len(clip_paths) == 1:
        shutil.copy2(clip_paths[0], output_path)
        return True
    
    # Try concat demuxer (fast, no re-encode)
    concat_file = output_path + ".concat.txt"
    with open(concat_file, "w") as f:
        for p in clip_paths:
            f.write(f"file '{p}'\n")
    
    cmd = [FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", concat_file, "-c", "copy", output_path]
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=300)
        os.unlink(concat_file)
        if result.returncode == 0 and os.path.exists(output_path):
            return True
    except:
        if os.path.exists(concat_file):
            os.unlink(concat_file)
    
    # Fallback: re-encode with concat filter
    concat_input = []
    for p in clip_paths:
        concat_input.extend(["-i", p])
    filter_parts = []
    for i in range(len(clip_paths)):
        filter_parts.append(f"[{i}:v]")
    filter_str = "".join(filter_parts) + f"concat=n={len(clip_paths)}:v=1:a=0[v]"
    cmd = [FFMPEG, "-y"] + concat_input + ["-filter_complex", filter_str,
           "-map", "[v]", "-c:v", "libx264", "-preset", "fast", "-crf", "28",
           "-pix_fmt", "yuv420p", output_path]
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=300)
        return result.returncode == 0
    except:
        return False

# === Main video generation pipeline ===

def _generate_video(project_id: str, description: str, style: str,
                    duration_s: int, resolution: str, mode: str):
    """Background video generation thread with 3-tier auto-failover."""
    db = get_db()
    
    try:
        db.execute("UPDATE movies SET status='storyboarding', progress=0.05 WHERE project_id=?", (project_id,))
        db.commit()
        
        output_path = str(VIDEOS_DIR / f"{project_id}.mp4")
        success = False
        
        # === Tier 0: Agnes AI — Real motion video ===
        logger.info(f"Trying Tier 0 (Agnes AI) for {project_id}")
        result = _generate_tier0_video(project_id, description, style, duration_s, resolution, db)
        if result:
            output_path = result
            success = True
            logger.info(f"Tier 0 succeeded for {project_id}")
        
        # === Tier 1: Pollinations Video API ===
        if not success and duration_s <= 15:
            logger.info(f"Tier 0 failed/unavailable, trying Tier 1 for {project_id}")
            db.execute("UPDATE movies SET status='generating video', progress=0.2 WHERE project_id=?", (project_id,))
            db.commit()
            
            enhanced_prompt = _enhance_scene_prompt(description, style, 0)
            success = _try_pollinations_video(enhanced_prompt, duration_s, output_path)
            
            if success:
                logger.info(f"Tier 1 succeeded for {project_id}")
        
        # === Tier 2: AI Images + Ken Burns ===
        if not success:
            logger.info(f"Tier 1 failed/unavailable, trying Tier 2 for {project_id}")
            result = _generate_tier2_video(project_id, description, style, duration_s, resolution, db)
            if result:
                output_path = result
                success = True
                logger.info(f"Tier 2 succeeded for {project_id}")
        
        # === Tier 3: Solid color + text ===
        if not success:
            logger.info(f"Tier 2 failed, trying Tier 3 for {project_id}")
            result = _generate_tier3_video(project_id, description, style, duration_s, resolution, db)
            if result:
                output_path = result
                success = True
                logger.info(f"Tier 3 succeeded for {project_id}")
        
        if not success:
            raise Exception("All 3 tiers failed")
        
        # Generate thumbnail
        db.execute("UPDATE movies SET status='finalizing', progress=0.95 WHERE project_id=?", (project_id,))
        db.commit()
        
        thumb_path = str(THUMBS_DIR / f"{project_id}.jpg")
        _generate_thumbnail(output_path, thumb_path)
        
        # Update DB
        db.execute("""UPDATE movies SET status='complete', progress=1.0,
                     output_path=?, thumbnail_path=?, completed_at=?
                     WHERE project_id=?""",
                   (output_path, thumb_path, time.time(), project_id))
        db.commit()
        logger.info(f"Video generation complete: {project_id}")
        
    except Exception as e:
        logger.error(f"Video generation failed for {project_id}: {e}")
        db.execute("UPDATE movies SET status='failed', progress=0 WHERE project_id=?", (project_id,))
        db.commit()
    finally:
        db.close()

# === SoulMovies Endpoints ===

@router.post("/v1/soulmovies/create")
async def create_movie(request: Request):
    """Create a new AI video generation project."""
    body = await request.json()
    description = body.get("text_description", "").strip()
    if not description:
        return JSONResponse({"error": "Description required"}, status_code=400)
    
    style = body.get("style", "cinematic")
    mode = body.get("mode", "auto")
    resolution = body.get("resolution", "1080p")
    duration_s = min(1800, max(10, int(body.get("duration_s", 35))))
    
    project_id = str(uuid.uuid4())[:12]
    
    db = get_db()
    db.execute("""INSERT INTO movies 
                 (project_id, text_description, style, mode, resolution, duration_s, 
                  status, progress, created_at, creator_id, creator_name)
                 VALUES (?, ?, ?, ?, ?, ?, 'pending', 0.0, ?, 'founder', 'Founder')""",
               (project_id, description, style, mode, resolution, duration_s, time.time()))
    db.commit()
    db.close()
    
    # Start generation in background
    thread = threading.Thread(
        target=_generate_video,
        args=(project_id, description, style, duration_s, resolution, mode),
        daemon=True
    )
    thread.start()
    
    return {"project_id": project_id, "status": "pending", "progress": 0.0}

@router.get("/v1/soulmovies/status/{project_id}")
async def get_movie_status(project_id: str):
    db = get_db()
    row = db.execute("SELECT * FROM movies WHERE project_id=?", (project_id,)).fetchone()
    db.close()
    if not row:
        return JSONResponse({"error": "Not found"}, status_code=404)
    
    return {
        "project_id": row["project_id"],
        "text_description": row["text_description"],
        "style": row["style"],
        "status": row["status"],
        "progress": row["progress"],
        "output_path": row["output_path"] or "",
        "created_at": row["created_at"],
        "completed_at": row["completed_at"],
    }

@router.get("/v1/soulmovies/list")
async def list_movies():
    db = get_db()
    rows = db.execute("SELECT * FROM movies ORDER BY created_at DESC").fetchall()
    db.close()
    
    projects = []
    for row in rows:
        projects.append({
            "project_id": row["project_id"],
            "text_description": row["text_description"],
            "style": row["style"],
            "status": row["status"],
            "progress": row["progress"],
            "output_path": row["output_path"] or "",
            "created_at": row["created_at"],
            "completed_at": row["completed_at"],
        })
    
    return {"projects": projects}

@router.get("/v1/soulmovies/download/{project_id}")
async def download_movie(project_id: str):
    db = get_db()
    row = db.execute("SELECT * FROM movies WHERE project_id=?", (project_id,)).fetchone()
    db.close()
    if not row or not row["output_path"] or not os.path.exists(row["output_path"]):
        return JSONResponse({"error": "Video not ready"}, status_code=404)
    
    return FileResponse(row["output_path"], media_type="video/mp4", 
                       filename=f"soulmovie_{project_id}.mp4")

@router.delete("/v1/soulmovies/{project_id}")
async def delete_movie(project_id: str):
    db = get_db()
    row = db.execute("SELECT * FROM movies WHERE project_id=?", (project_id,)).fetchone()
    if row:
        # Delete files
        if row["output_path"] and os.path.exists(row["output_path"]):
            os.unlink(row["output_path"])
        if row["thumbnail_path"] and os.path.exists(row["thumbnail_path"]):
            os.unlink(row["thumbnail_path"])
        db.execute("DELETE FROM movies WHERE project_id=?", (project_id,))
        db.commit()
    db.close()
    return {"status": "deleted"}

@router.post("/v1/soulmovies/publish/{project_id}")
async def publish_movie(project_id: str):
    db = get_db()
    row = db.execute("SELECT * FROM movies WHERE project_id=?", (project_id,)).fetchone()
    if not row:
        db.close()
        return JSONResponse({"error": "Not found"}, status_code=404)
    
    # Mark as published and add to SoulTube
    db.execute("UPDATE movies SET published=1 WHERE project_id=?", (project_id,))
    
    # Add to SoulTube
    video_id = str(uuid.uuid4())[:12]
    db.execute("""INSERT INTO soultube_videos 
                 (id, title, description, creator_id, creator_name, duration_s, 
                  views, likes, file_path, thumbnail_path, resolution, tags, created_at, category)
                 VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, '1080p', 'AI generated', ?, 'Tech')""",
               (video_id, row["text_description"][:80], row["text_description"],
                row["creator_id"], row["creator_name"], row["duration_s"],
                row["output_path"], row["thumbnail_path"], time.time()))
    db.commit()
    db.close()
    
    return {"status": "published", "soultube_id": video_id}

@router.get("/v1/soulmovies/styles")
async def get_styles():
    return {"styles": [
        {"id": k, "name": k.title(), "desc": v.get("music", "")}
        for k, v in STYLES.items()
    ]}

@router.get("/v1/soulmovies/stats")
async def get_movies_stats():
    db = get_db()
    total = db.execute("SELECT COUNT(*) as c FROM movies").fetchone()["c"]
    complete = db.execute("SELECT COUNT(*) as c FROM movies WHERE status='complete'").fetchone()["c"]
    rendering = db.execute("SELECT COUNT(*) as c FROM movies WHERE status IN ('pending','rendering','storyboarding','finalizing')").fetchone()["c"]
    db.close()
    
    return {
        "total": total,
        "complete": complete,
        "rendering": rendering,
        "gpu_status": {
            "mode": "cpu",
            "providers": ["clip_assembly"],
            "ffmpeg": True,
        }
    }

# === SoulTube Endpoints ===

@router.get("/v1/soultube/trending")
async def get_trending(limit: int = 20):
    db = get_db()
    rows = db.execute(
        "SELECT * FROM soultube_videos ORDER BY views DESC, created_at DESC LIMIT ?", (limit,)
    ).fetchall()
    db.close()
    return {"videos": [_video_dict(r) for r in rows]}

@router.get("/v1/soultube/search")
async def search_videos(q: str = "", limit: int = 20):
    db = get_db()
    if q:
        rows = db.execute(
            "SELECT * FROM soultube_videos WHERE title LIKE ? OR description LIKE ? OR tags LIKE ? ORDER BY views DESC LIMIT ?",
            (f"%{q}%", f"%{q}%", f"%{q}%", limit)
        ).fetchall()
    else:
        rows = db.execute("SELECT * FROM soultube_videos ORDER BY views DESC LIMIT ?", (limit,)).fetchall()
    db.close()
    return {"videos": [_video_dict(r) for r in rows]}

@router.get("/v1/soultube/video/{video_id}")
async def get_video(video_id: str):
    db = get_db()
    row = db.execute("SELECT * FROM soultube_videos WHERE id=?", (video_id,)).fetchone()
    if row:
        # Increment views
        db.execute("UPDATE soultube_videos SET views=views+1 WHERE id=?", (video_id,))
        # Add to history
        hist_id = str(uuid.uuid4())[:12]
        db.execute("INSERT INTO watch_history (id, user_id, video_id, watched_at) VALUES (?, 'founder', ?, ?)",
                   (hist_id, video_id, time.time()))
        db.commit()
    db.close()
    if not row:
        return JSONResponse({"error": "Not found"}, status_code=404)
    return _video_dict(row)

@router.get("/v1/soultube/recommendations/{video_id}")
async def get_recommendations(video_id: str):
    db = get_db()
    row = db.execute("SELECT category FROM soultube_videos WHERE id=?", (video_id,)).fetchone()
    category = row["category"] if row else "All"
    rows = db.execute(
        "SELECT * FROM soultube_videos WHERE id != ? AND (category = ? OR 1=1) ORDER BY views DESC LIMIT 10",
        (video_id, category)
    ).fetchall()
    db.close()
    return {"videos": [_video_dict(r) for r in rows]}

@router.get("/v1/soultube/comments/{video_id}")
async def get_comments(video_id: str, sort: str = "top"):
    db = get_db()
    if sort == "top":
        rows = db.execute("SELECT * FROM comments WHERE video_id=? ORDER BY likes DESC, created_at DESC", (video_id,)).fetchall()
    else:
        rows = db.execute("SELECT * FROM comments WHERE video_id=? ORDER BY created_at DESC", (video_id,)).fetchall()
    db.close()
    
    comments = []
    for r in rows:
        comments.append({
            "id": r["id"],
            "user_name": r["user_name"],
            "text": r["text"],
            "likes": r["likes"],
            "created_at": r["created_at"],
        })
    return {"comments": comments}

@router.post("/v1/soultube/comments/{video_id}")
async def add_comment(video_id: str, request: Request):
    body = await request.json()
    text = body.get("text", "").strip()
    if not text:
        return JSONResponse({"error": "Comment text required"}, status_code=400)
    
    comment_id = str(uuid.uuid4())[:12]
    db = get_db()
    db.execute("INSERT INTO comments (id, video_id, user_name, text, likes, created_at) VALUES (?, ?, 'You', ?, 0, ?)",
               (comment_id, video_id, text, time.time()))
    db.commit()
    db.close()
    
    return {"id": comment_id, "user_name": "You", "text": text, "likes": 0, "created_at": time.time()}

@router.post("/v1/soultube/like/{video_id}")
async def like_video(video_id: str):
    db = get_db()
    row = db.execute("SELECT likes FROM soultube_videos WHERE id=?", (video_id,)).fetchone()
    if row:
        db.execute("UPDATE soultube_videos SET likes=likes+1 WHERE id=?", (video_id,))
        db.commit()
        db.close()
        return {"likes": row["likes"] + 1, "liked": True}
    db.close()
    return JSONResponse({"error": "Not found"}, status_code=404)

@router.post("/v1/soultube/subscribe/{creator_id}")
async def subscribe(creator_id: str):
    sub_id = str(uuid.uuid4())[:12]
    db = get_db()
    db.execute("INSERT OR IGNORE INTO subscriptions (id, subscriber_id, creator_id, created_at) VALUES (?, 'founder', ?, ?)",
               (sub_id, creator_id, time.time()))
    db.commit()
    db.close()
    return {"subscribed": True}

@router.delete("/v1/soultube/subscribe/{creator_id}")
async def unsubscribe(creator_id: str):
    db = get_db()
    db.execute("DELETE FROM subscriptions WHERE subscriber_id='founder' AND creator_id=?", (creator_id,))
    db.commit()
    db.close()
    return {"subscribed": False}

@router.get("/v1/soultube/channel/{creator_id}")
async def get_channel(creator_id: str):
    db = get_db()
    videos = db.execute("SELECT * FROM soultube_videos WHERE creator_id=? ORDER BY created_at DESC", (creator_id,)).fetchall()
    subs = db.execute("SELECT COUNT(*) as c FROM subscriptions WHERE creator_id=?", (creator_id,)).fetchone()["c"]
    db.close()
    return {
        "creator_id": creator_id,
        "creator_name": videos[0]["creator_name"] if videos else "Creator",
        "subscribers": subs,
        "videos": [_video_dict(r) for r in videos],
    }

@router.get("/v1/soultube/analytics")
async def get_analytics():
    db = get_db()
    total_views = db.execute("SELECT COALESCE(SUM(views),0) as s FROM soultube_videos").fetchone()["s"]
    total_likes = db.execute("SELECT COALESCE(SUM(likes),0) as s FROM soultube_videos").fetchone()["s"]
    total_videos = db.execute("SELECT COUNT(*) as c FROM soultube_videos").fetchone()["c"]
    total_subs = db.execute("SELECT COUNT(*) as c FROM subscriptions").fetchone()["c"]
    db.close()
    return {"total_views": total_views, "total_likes": total_likes, "total_videos": total_videos, "subscribers": total_subs}

@router.get("/v1/soultube/history")
async def get_history():
    db = get_db()
    rows = db.execute("""
        SELECT v.* FROM soultube_videos v 
        JOIN watch_history h ON v.id = h.video_id 
        WHERE h.user_id='founder' 
        ORDER BY h.watched_at DESC LIMIT 50
    """).fetchall()
    db.close()
    return {"videos": [_video_dict(r) for r in rows]}

@router.get("/v1/soultube/stats")
async def get_soultube_stats():
    db = get_db()
    total = db.execute("SELECT COUNT(*) as c FROM soultube_videos").fetchone()["c"]
    db.close()
    return {"total_videos": total}

@router.post("/v1/soultube/upload")
async def upload_video(file: UploadFile = File(...), title: str = Form(...), 
                       description: str = Form(""), tags: str = Form("")):
    video_id = str(uuid.uuid4())[:12]
    file_path = str(UPLOADS_DIR / f"{video_id}.mp4")
    
    # Save uploaded file
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)
    
    # Get duration
    duration = 0
    try:
        result = subprocess.run([FFMPEG, "-i", file_path, "-hide_banner"], 
                              capture_output=True, text=True, timeout=10)
        for line in result.stderr.split("\n"):
            if "Duration:" in line:
                parts = line.split("Duration:")[1].split(",")[0].strip().split(":")
                duration = int(float(parts[2]))
                break
    except:
        pass
    
    # Generate thumbnail
    thumb_path = str(THUMBS_DIR / f"{video_id}.jpg")
    _generate_thumbnail(file_path, thumb_path)
    
    db = get_db()
    db.execute("""INSERT INTO soultube_videos 
                 (id, title, description, creator_id, creator_name, duration_s, 
                  views, likes, file_path, thumbnail_path, resolution, tags, created_at, category)
                 VALUES (?, ?, ?, 'founder', 'Founder', ?, 0, 0, ?, ?, '720p', ?, ?, 'All')""",
               (video_id, title, description, duration, file_path, thumb_path, tags, time.time()))
    db.commit()
    db.close()
    
    return {"id": video_id, "status": "uploaded", "title": title}

@router.get("/v1/soultube/stream/{video_id}")
async def stream_video(video_id: str, resolution: str = "720p"):
    db = get_db()
    row = db.execute("SELECT * FROM soultube_videos WHERE id=?", (video_id,)).fetchone()
    db.close()
    if not row or not os.path.exists(row["file_path"]):
        return JSONResponse({"error": "Video not found"}, status_code=404)
    
    return FileResponse(row["file_path"], media_type="video/mp4")

@router.get("/v1/soultube/thumbnail/{video_id}")
async def get_thumbnail(video_id: str):
    db = get_db()
    row = db.execute("SELECT thumbnail_path FROM soultube_videos WHERE id=?", (video_id,)).fetchone()
    db.close()
    if row and row["thumbnail_path"] and os.path.exists(row["thumbnail_path"]):
        return FileResponse(row["thumbnail_path"], media_type="image/jpeg")
    return JSONResponse({"error": "No thumbnail"}, status_code=404)

# === Helper ===
def _video_dict(row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"],
        "creator_id": row["creator_id"],
        "creator_name": row["creator_name"],
        "duration_s": row["duration_s"],
        "views": row["views"],
        "likes": row["likes"],
        "thumbnail_url": f"/v1/soultube/thumbnail/{row['id']}",
        "resolution": row["resolution"],
        "tags": [t.strip() for t in row["tags"].split(",") if t.strip()] if row["tags"] else [],
        "created_at": row["created_at"],
    }
