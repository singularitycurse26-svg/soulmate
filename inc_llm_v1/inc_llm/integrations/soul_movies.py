"""SoulMovies — text-to-video maker for Soulmate OS.

Users type a text description and the AI generates a 35-second video from scratch.
Two modes:
- AI Video Generation (online): Uses AI video generation models on RLOS GPU nodes
- Clip-Based Assembly (offline/always available): Stock footage + AI voiceover + overlays

Uses recursive link mechanics for speed:
- RenderCache (like PrefixCache): caches storyboards + scene renders
- RenderBatchProcessor (like BatchProcessor): batches scene renders to GPU nodes
- RenderLoadBalancer (like LoadBalancer): routes to best GPU node
- RenderPredictiveLoader (like PredictiveLoader): preloads next video gen models

Zero-slowdown: all operations async, caching O(1), background preloading.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import subprocess
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, AsyncIterator

import urllib.request
import urllib.error

from inc_llm.config import SoulMoviesConfig
from inc_llm.integrations.soul_movies_cache import RenderCache
from inc_llm.integrations.soul_movies_batch import RenderBatchProcessor
from inc_llm.integrations.soul_movies_balancer import RenderLoadBalancer
from inc_llm.integrations.soul_movies_predictive import RenderPredictiveLoader

logger = logging.getLogger(__name__)


class RenderMode(str, Enum):
    AI_GENERATION = "ai_generation"
    CLIP_ASSEMBLY = "clip_assembly"
    AUTO = "auto"


class ProjectStatus(str, Enum):
    PENDING = "pending"
    STORYBOARDING = "storyboarding"
    RENDERING = "rendering"
    AUDIO = "audio"
    OVERLAYS = "overlays"
    FINALIZING = "finalizing"
    COMPLETE = "complete"
    FAILED = "failed"


@dataclass
class Scene:
    index: int
    prompt: str
    duration_s: int = 7
    camera_angle: str = ""
    mood: str = ""
    transition: str = "crossfade"
    voiceover_text: str = ""
    overlay_text: str = ""
    render_path: str = ""
    render_status: str = "pending"


@dataclass
class VideoProject:
    project_id: str
    text_description: str
    style: str = "cinematic"
    mode: RenderMode = RenderMode.AUTO
    resolution: str = "1080p"
    duration_s: int = 35
    scenes: list[Scene] = field(default_factory=list)
    voiceover_path: str = ""
    music_path: str = ""
    output_path: str = ""
    status: ProjectStatus = ProjectStatus.PENDING
    progress: float = 0.0
    created_at: float = field(default_factory=time.time)
    completed_at: float = 0.0
    error: str = ""


STYLE_PRESETS = {
    "cinematic": {
        "temperature": 0.8,
        "prompt_suffix": "cinematic lighting, dramatic atmosphere, film grain, 24fps",
        "music_style": "orchestral",
        "transition": "crossfade",
    },
    "documentary": {
        "temperature": 0.6,
        "prompt_suffix": "documentary style, natural lighting, informative, steady shots",
        "music_style": "ambient",
        "transition": "cut",
    },
    "music_video": {
        "temperature": 0.9,
        "prompt_suffix": "music video style, dynamic cuts, vibrant colors, rhythmic pacing",
        "music_style": "electronic",
        "transition": "cut",
    },
    "social media": {
        "temperature": 0.7,
        "prompt_suffix": "social media style, bright colors, fast-paced, engaging",
        "music_style": "upbeat",
        "transition": "cut",
    },
    "anime": {
        "temperature": 0.85,
        "prompt_suffix": "anime style, cel-shaded, expressive characters, dynamic angles",
        "music_style": "jpop",
        "transition": "crossfade",
    },
    "realistic": {
        "temperature": 0.5,
        "prompt_suffix": "photorealistic, natural lighting, high detail, lifelike",
        "music_style": "ambient",
        "transition": "crossfade",
    },
}


class CloudGPUAdapter:
    """Multi-provider cloud GPU adapter for free video generation.

    Provider priority: free.ai → HuggingFace → NovAI → Replicate
    Falls back to clip assembly if all cloud providers fail.
    """

    PROVIDERS = {
        "free_ai": {
            "url": "https://free.ai/api/v1/video/generations",
            "model": "cogvideox",
            "needs_key": False,
        },
        "huggingface": {
            "url": "https://{space}.hf.space/api/predict",
            "model": "wan2.2",
            "needs_key": False,
        },
        "novai": {
            "url": "https://aiapi-pro.com/v1/video/generations",
            "model": "cogvideox-flash",
            "needs_key": True,
        },
        "replicate": {
            "url": "https://api.replicate.com/v1/predictions",
            "model": "wan2.1-t2v-14b",
            "needs_key": True,
        },
    }

    def __init__(self, config: SoulMoviesConfig) -> None:
        self.config = config
        self._providers = [
            p for p in config.cloud_gpu_providers if p in self.PROVIDERS
        ] or ["free_ai", "huggingface", "novai"]

    def is_available(self) -> bool:
        return self.config.cloud_gpu_enabled and len(self._providers) > 0

    async def generate_clip(
        self,
        prompt: str,
        duration_s: int,
        resolution: str,
        style: str,
        reference_image: bytes | None = None,
    ) -> bytes | None:
        """Try each provider in priority order. Returns video bytes or None."""
        for provider_name in self._providers:
            provider = self.PROVIDERS[provider_name]
            api_key = self.config.cloud_gpu_api_keys.get(provider_name, "")
            if provider["needs_key"] and not api_key:
                continue
            try:
                logger.info("CloudGPU: trying %s for clip generation", provider_name)
                data = await self._call_provider(
                    provider_name, provider, prompt, duration_s, resolution, style, api_key, reference_image
                )
                if data:
                    logger.info("CloudGPU: %s succeeded (%d bytes)", provider_name, len(data))
                    return data
            except Exception as e:
                logger.warning("CloudGPU: %s failed: %s", provider_name, e)
                continue
        return None

    async def _call_provider(
        self,
        name: str,
        provider: dict,
        prompt: str,
        duration_s: int,
        resolution: str,
        style: str,
        api_key: str,
        reference_image: bytes | None,
    ) -> bytes | None:
        if name == "free_ai":
            return await self._call_free_ai(prompt, duration_s, resolution, style)
        elif name == "huggingface":
            return await self._call_huggingface(prompt, duration_s, resolution, style)
        elif name == "novai":
            return await self._call_novai(prompt, duration_s, resolution, style, api_key)
        elif name == "replicate":
            return await self._call_replicate(prompt, duration_s, resolution, style, api_key)
        return None

    async def _call_free_ai(self, prompt: str, duration_s: int, resolution: str, style: str) -> bytes | None:
        body = json.dumps({
            "prompt": prompt,
            "duration": min(duration_s, 3),
            "model": "cogvideox",
        }).encode()
        req = urllib.request.Request(
            "https://free.ai/api/v1/video/generations",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        def _do():
            with urllib.request.urlopen(req, timeout=self.config.cloud_gpu_timeout_s) as resp:
                result = json.loads(resp.read().decode())
                video_url = result.get("video_url") or result.get("content", {}).get("video_url")
                if video_url:
                    return self._download(video_url)
                return None
        return await asyncio.to_thread(_do)

    async def _call_huggingface(self, prompt: str, duration_s: int, resolution: str, style: str) -> bytes | None:
        body = json.dumps({
            "data": [prompt, min(duration_s, 5), 25],
        }).encode()
        space = "cbensimon/wan2-2-fp8da-aoti-preview2"
        req = urllib.request.Request(
            f"https://{space}.hf.space/api/predict",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        def _do():
            with urllib.request.urlopen(req, timeout=self.config.cloud_gpu_timeout_s) as resp:
                result = json.loads(resp.read().decode())
                if "data" in result and result["data"]:
                    video_url = result["data"][0].get("url") if isinstance(result["data"][0], dict) else None
                    if not video_url and isinstance(result["data"][0], str):
                        video_url = result["data"][0]
                    if video_url:
                        return self._download(video_url)
                return None
        return await asyncio.to_thread(_do)

    async def _call_novai(self, prompt: str, duration_s: int, resolution: str, style: str, api_key: str) -> bytes | None:
        body = json.dumps({
            "model": "cogvideox-flash",
            "prompt": prompt,
        }).encode()
        req = urllib.request.Request(
            "https://aiapi-pro.com/v1/video/generations",
            data=body,
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
            method="POST",
        )
        def _do():
            with urllib.request.urlopen(req, timeout=30) as resp:
                job = json.loads(resp.read().decode())
                job_id = job.get("id")
                if not job_id:
                    return None
            for _ in range(60):
                time.sleep(5)
                poll_req = urllib.request.Request(
                    f"https://aiapi-pro.com/v1/video/generations/{job_id}?model=cogvideox-flash",
                    headers={"Authorization": f"Bearer {api_key}"},
                )
                with urllib.request.urlopen(poll_req, timeout=30) as poll_resp:
                    r = json.loads(poll_resp.read().decode())
                    if r.get("status") == "succeeded":
                        video_url = r.get("content", {}).get("video_url")
                        if video_url:
                            return self._download(video_url)
                        return None
                    if r.get("status") == "failed":
                        return None
            return None
        return await asyncio.to_thread(_do)

    async def _call_replicate(self, prompt: str, duration_s: int, resolution: str, style: str, api_key: str) -> bytes | None:
        body = json.dumps({
            "input": {
                "prompt": prompt,
                "duration": min(duration_s, 8),
            }
        }).encode()
        req = urllib.request.Request(
            "https://api.replicate.com/v1/predictions",
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Token {api_key}",
            },
            method="POST",
        )
        def _do():
            with urllib.request.urlopen(req, timeout=30) as resp:
                prediction = json.loads(resp.read().decode())
                get_url = prediction.get("urls", {}).get("get")
                if not get_url:
                    return None
            for _ in range(60):
                time.sleep(5)
                poll_req = urllib.request.Request(
                    get_url,
                    headers={"Authorization": f"Token {api_key}"},
                )
                with urllib.request.urlopen(poll_req, timeout=30) as poll_resp:
                    r = json.loads(poll_resp.read().decode())
                    if r.get("status") == "succeeded":
                        output = r.get("output")
                        if output and isinstance(output, str):
                            return self._download(output)
                        if output and isinstance(output, list) and output:
                            return self._download(output[0])
                        return None
                    if r.get("status") == "failed":
                        return None
            return None
        return await asyncio.to_thread(_do)

    def _download(self, url: str) -> bytes | None:
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=120) as resp:
                return resp.read()
        except Exception as e:
            logger.warning("CloudGPU: download failed from %s: %s", url[:50], e)
            return None


class SoulMoviesEngine:
    """Main SoulMovies engine — text-to-video generation with recursive link speed.

    Integrates RenderCache, RenderBatchProcessor, RenderLoadBalancer, and
    RenderPredictiveLoader for zero-slowdown operation.
    Supports cloud GPU providers (free.ai, HuggingFace, NovAI, Replicate)
    with automatic failover to clip assembly.
    """

    def __init__(
        self,
        config: SoulMoviesConfig,
        harness: Any | None = None,
        rlos: Any | None = None,
        node_manager: Any | None = None,
        voice_engine: Any | None = None,
    ) -> None:
        self.config = config
        self.harness = harness
        self.rlos = rlos
        self.voice_engine = voice_engine
        self._output_dir = Path(os.path.expanduser(config.output_dir))
        self._output_dir.mkdir(parents=True, exist_ok=True)

        self._projects: dict[str, VideoProject] = {}

        self._render_cache = RenderCache(
            max_entries=config.render_cache_max_entries,
            warm_threshold=config.render_cache_warm_threshold,
        ) if config.render_cache_enabled else None

        self._render_balancer = RenderLoadBalancer(node_manager) if node_manager else None

        self._render_predictive = RenderPredictiveLoader(
            preload_fn=self._preload_video_model,
            prefetch_count=config.predictive_prefetch_count,
        ) if config.render_predictive_enabled else None

        self._render_batch = RenderBatchProcessor(
            render_fn=self._render_single_scene,
            batch_window_ms=config.render_batch_window_ms,
            max_batch_size=config.render_batch_max_size,
        )

        self._cloud_gpu = CloudGPUAdapter(config) if config.cloud_gpu_enabled else None

    async def generate_video(
        self,
        text_description: str,
        style: str = "cinematic",
        mode: RenderMode = RenderMode.AUTO,
        resolution: str | None = None,
        duration_s: int | None = None,
    ) -> VideoProject:
        """Generate a video from text description.

        Full pipeline: storyboard → render scenes → audio → overlays → final.
        """
        project = VideoProject(
            project_id=str(uuid.uuid4()),
            text_description=text_description,
            style=style,
            mode=mode,
            resolution=resolution or self.config.default_resolution,
            duration_s=duration_s or self.config.default_duration_s,
        )
        self._projects[project.project_id] = project

        try:
            await self._generate_storyboard(project)
            await self._render_scenes(project)
            if self.config.voiceover_enabled:
                await self._add_voiceover(project)
            if self.config.music_enabled:
                await self._add_music(project)
            await self._add_overlays(project)
            await self._render_final(project)

            project.status = ProjectStatus.COMPLETE
            project.completed_at = time.time()
            logger.info("SoulMovies project %s complete: %s", project.project_id, project.output_path)

        except Exception as e:
            project.status = ProjectStatus.FAILED
            project.error = str(e)
            logger.error("SoulMovies project %s failed: %s", project.project_id, e)

        return project

    async def _generate_storyboard(self, project: VideoProject) -> None:
        project.status = ProjectStatus.STORYBOARDING
        project.progress = 0.05

        if self._render_cache:
            cached = self._render_cache.lookup_storyboard(project.text_description, project.style)
            if cached:
                project.scenes = [
                    Scene(
                        index=i,
                        prompt=s["prompt"],
                        duration_s=s.get("duration_s", self.config.scene_duration_s),
                        camera_angle=s.get("camera_angle", ""),
                        mood=s.get("mood", ""),
                        transition=s.get("transition", self.config.transition_style),
                        voiceover_text=s.get("voiceover_text", ""),
                        overlay_text=s.get("overlay_text", ""),
                    )
                    for i, s in enumerate(cached["scenes"])
                ]
                project.progress = 0.15
                logger.info("SoulMovies storyboard from cache for %s", project.project_id)
                return

        style_preset = STYLE_PRESETS.get(project.style, STYLE_PRESETS["cinematic"])
        if self.config.dynamic_scene_count:
            scene_duration = min(self.config.max_scene_duration_s, max(5, project.duration_s // 5))
            scene_count = max(1, project.duration_s // scene_duration)
            scene_count = min(scene_count, 200)
        else:
            scene_count = self.config.scene_count
            scene_duration = project.duration_s // scene_count

        if self.harness:
            prompt = self._build_storyboard_prompt(
                project.text_description, project.style, scene_count, scene_duration, style_preset
            )
            response = await self.harness.chat(
                user_id="soulmovies",
                message=prompt,
            )
            response_text = response.get("content", "") if isinstance(response, dict) else str(response)
            scenes = self._parse_storyboard_response(response_text, scene_count, scene_duration)
        else:
            scenes = self._generate_fallback_storyboard(
                project.text_description, scene_count, scene_duration
            )

        project.scenes = scenes
        project.progress = 0.15

        if self._render_cache:
            self._render_cache.store_storyboard(
                project.text_description,
                project.style,
                {"scenes": [{"prompt": s.prompt, "duration_s": s.duration_s,
                            "camera_angle": s.camera_angle, "mood": s.mood,
                            "transition": s.transition, "voiceover_text": s.voiceover_text,
                            "overlay_text": s.overlay_text} for s in scenes]},
            )

    def _build_storyboard_prompt(
        self, text: str, style: str, scene_count: int, scene_duration: int, preset: dict
    ) -> str:
        total_duration = scene_count * scene_duration
        if self.config.act_based_storyboard and scene_count > 20:
            act_count = max(1, scene_count // 20)
            scenes_per_act = scene_count // act_count
            return (
                f"Create a {scene_count}-scene storyboard for a {total_duration}-second video.\n"
                f"Description: {text}\n"
                f"Style: {style} ({preset['prompt_suffix']})\n"
                f"Organize into {act_count} acts of {scenes_per_act} scenes each.\n"
                f"Each act should have a clear narrative arc with setup, development, and resolution.\n"
                f"For each scene, provide:\n"
                f"- prompt: detailed visual description for AI video generation\n"
                f"- camera_angle: camera movement (static, pan_left, pan_right, zoom_in, zoom_out, orbit)\n"
                f"- mood: emotional tone\n"
                f"- transition: transition to next scene (crossfade, cut, dissolve)\n"
                f"- voiceover_text: narration for this scene\n"
                f"- overlay_text: text overlay to display\n"
                f"Return as JSON array of {scene_count} objects."
            )
        return (
            f"Create a {scene_count}-scene storyboard for a {total_duration}-second video.\n"
            f"Description: {text}\n"
            f"Style: {style} ({preset['prompt_suffix']})\n"
            f"Each scene is {scene_duration} seconds.\n"
            f"For each scene, provide:\n"
            f"- prompt: detailed visual description for AI video generation\n"
            f"- camera_angle: camera movement (static, pan_left, pan_right, zoom_in, zoom_out, orbit)\n"
            f"- mood: emotional tone\n"
            f"- transition: transition to next scene (crossfade, cut, dissolve)\n"
            f"- voiceover_text: narration for this scene\n"
            f"- overlay_text: text overlay to display\n"
            f"Return as JSON array of {scene_count} objects."
        )

    def _parse_storyboard_response(
        self, response: str, scene_count: int, scene_duration: int
    ) -> list[Scene]:
        scenes = []
        try:
            start = response.find("[")
            end = response.rfind("]") + 1
            if start >= 0 and end > start:
                data = json.loads(response[start:end])
            else:
                data = []
        except (json.JSONDecodeError, ValueError):
            data = []

        if not data:
            return self._generate_fallback_storyboard("", scene_count, scene_duration)

        for i, s in enumerate(data[:scene_count]):
            scenes.append(Scene(
                index=i,
                prompt=s.get("prompt", ""),
                duration_s=s.get("duration_s", scene_duration),
                camera_angle=s.get("camera_angle", "static"),
                mood=s.get("mood", ""),
                transition=s.get("transition", self.config.transition_style),
                voiceover_text=s.get("voiceover_text", ""),
                overlay_text=s.get("overlay_text", ""),
            ))
        return scenes

    def _generate_fallback_storyboard(
        self, text: str, scene_count: int, scene_duration: int
    ) -> list[Scene]:
        scenes = []
        for i in range(scene_count):
            scenes.append(Scene(
                index=i,
                prompt=f"{text} - scene {i+1}",
                duration_s=scene_duration,
                camera_angle="static",
                mood="neutral",
                transition=self.config.transition_style,
                voiceover_text="",
                overlay_text="",
            ))
        return scenes

    async def _render_scenes(self, project: VideoProject) -> None:
        project.status = ProjectStatus.RENDERING

        actual_mode = project.mode
        if actual_mode == RenderMode.AUTO:
            if self._render_balancer and self._has_gpu_available():
                actual_mode = RenderMode.AI_GENERATION
            elif self._cloud_gpu and self._cloud_gpu.is_available():
                actual_mode = RenderMode.AI_GENERATION
            else:
                actual_mode = RenderMode.CLIP_ASSEMBLY

        if actual_mode == RenderMode.AI_GENERATION:
            await self._render_ai_video(project)
        else:
            await self._render_clip_assembly(project)

    def _has_gpu_available(self) -> bool:
        if not self._render_balancer:
            return False
        node = self._render_balancer.select_gpu_node(min_vram_gb=self.config.min_vram_gb)
        return node is not None

    async def _render_ai_video(self, project: VideoProject) -> None:
        total_scenes = len(project.scenes)
        completed = 0
        reference_image: bytes | None = None

        for scene in project.scenes:
            scene_path = self._output_dir / f"{project.project_id}_scene_{scene.index}.mp4"

            if self.config.checkpoint_enabled and scene_path.exists():
                scene.render_path = str(scene_path)
                scene.render_status = "complete"
                completed += 1
                project.progress = 0.15 + (0.45 * completed / total_scenes)
                continue

            cached = None
            if self._render_cache:
                cached = self._render_cache.lookup_scene_render(scene.prompt, scene.index)

            if cached:
                scene_path.write_bytes(cached)
                scene.render_path = str(scene_path)
                scene.render_status = "complete"
                completed += 1
            else:
                data = None
                if self._cloud_gpu and self._cloud_gpu.is_available():
                    data = await self._cloud_gpu.generate_clip(
                        prompt=scene.prompt,
                        duration_s=scene.duration_s,
                        resolution=project.resolution,
                        style=project.style,
                        reference_image=reference_image if self.config.frame_chaining_enabled else None,
                    )

                if data:
                    scene_path.write_bytes(data)
                    scene.render_path = str(scene_path)
                    scene.render_status = "complete"
                    if self._render_cache:
                        self._render_cache.store_scene_render(scene.prompt, scene.index, data)
                    if self._render_predictive:
                        self._render_predictive.record_usage("text_to_video", project.style)
                    if self.config.frame_chaining_enabled:
                        reference_image = self._extract_last_frame(str(scene_path))
                else:
                    scene.render_status = "failed"
                    logger.warning("Scene %d cloud GPU failed, trying batch/local", scene.index)
                    try:
                        task = self._render_batch.submit(
                            scene_prompt=scene.prompt,
                            scene_index=scene.index,
                            duration_s=scene.duration_s,
                            resolution=project.resolution,
                            style=project.style,
                            priority=1,
                        )
                        batch_data = await task
                        scene_path.write_bytes(batch_data)
                        scene.render_path = str(scene_path)
                        scene.render_status = "complete"
                    except Exception as batch_err:
                        logger.error("Scene %d batch render also failed: %s", scene.index, batch_err)
                        if self.config.cloud_gpu_fallback_to_clip_assembly:
                            await self._render_single_scene_clip(scene, project)
                            if self.config.frame_chaining_enabled and scene.render_path:
                                reference_image = self._extract_last_frame(scene.render_path)

                completed += 1

            project.progress = 0.15 + (0.45 * completed / total_scenes)

        project.progress = 0.6

    async def _render_clip_assembly(self, project: VideoProject) -> None:
        for scene in project.scenes:
            await self._render_single_scene_clip(scene, project)
        project.progress = 0.6

    async def _render_single_scene_clip(self, scene: Scene, project: VideoProject) -> None:
        scene_path = self._output_dir / f"{project.project_id}_scene_{scene.index}.mp4"

        if self.harness and self.rlos:
            try:
                image_data = await self._generate_scene_image(scene, project)
                if image_data:
                    img_path = scene_path.with_suffix(".png")
                    img_path.write_bytes(image_data)
                    await self._apply_ken_burns(str(img_path), str(scene_path), scene.duration_s)
                    scene.render_path = str(scene_path)
                    scene.render_status = "complete"
                    return
            except Exception as e:
                logger.warning("Clip assembly for scene %d failed: %s", scene.index, e)

        await self._generate_solid_clip(str(scene_path), scene.duration_s, project.resolution)
        scene.render_path = str(scene_path)
        scene.render_status = "complete"

    async def _generate_scene_image(self, scene: Scene, project: VideoProject) -> bytes | None:
        if not hasattr(self.harness, 'image_gen') or not self.harness.image_gen:
            return None
        try:
            result = await self.harness.image_gen.generate(
                prompt=scene.prompt,
                width=1920 if project.resolution == "1080p" else 1280,
                height=1080 if project.resolution == "1080p" else 720,
            )
            if isinstance(result, bytes):
                return result
            if isinstance(result, dict) and "data" in result:
                return result["data"]
        except Exception as e:
            logger.warning("Image generation failed for scene %d: %s", scene.index, e)
        return None

    async def _apply_ken_burns(self, image_path: str, output_path: str, duration_s: int) -> None:
        cmd = [
            self.config.ffmpeg_path, "-y",
            "-loop", "1", "-i", image_path,
            "-vf", f"zoompan=z='min(zoom+0.0015,1.5)':d={duration_s*25}:s=1920x1080:fps=25",
            "-c:v", "libx264", "-t", str(duration_s), "-pix_fmt", "yuv420p",
            output_path,
        ]
        await asyncio.to_thread(
            lambda: subprocess.run(cmd, capture_output=True, timeout=60)
        )

    async def _generate_solid_clip(self, output_path: str, duration_s: int, resolution: str) -> None:
        w, h = (1920, 1080) if resolution == "1080p" else (1280, 720)
        cmd = [
            self.config.ffmpeg_path, "-y",
            "-f", "lavfi", "-i", f"color=c=black:s={w}x{h}:d={duration_s}",
            "-c:v", "libx264", "-pix_fmt", "yuv420p",
            output_path,
        ]
        await asyncio.to_thread(
            lambda: subprocess.run(cmd, capture_output=True, timeout=60)
        )

    async def _render_single_scene(
        self, scene_prompt: str, scene_index: int, duration_s: int, resolution: str, style: str
    ) -> bytes:
        if self._cloud_gpu and self._cloud_gpu.is_available():
            data = await self._cloud_gpu.generate_clip(
                prompt=scene_prompt,
                duration_s=duration_s,
                resolution=resolution,
                style=style,
            )
            if data:
                return data

        if self._render_balancer:
            node = self._render_balancer.select_gpu_node(
                scene_prompt=scene_prompt,
                min_vram_gb=self.config.min_vram_gb,
            )
            if node:
                node.active_render_jobs += 1
                try:
                    return await self._render_on_gpu_node(node, scene_prompt, duration_s, resolution, style)
                finally:
                    node.active_render_jobs -= 1

        raise RuntimeError("No GPU nodes available for AI video generation")

    async def _render_on_gpu_node(
        self, node: Any, prompt: str, duration_s: int, resolution: str, style: str
    ) -> bytes:
        logger.info("Rendering on GPU node %s: %s", node.url, prompt[:50])
        await asyncio.sleep(0.1)
        raise RuntimeError("GPU rendering not yet implemented — requires video model on RLOS node")

    async def _preload_video_model(self, model: str) -> bool:
        logger.debug("Preloading video model: %s", model)
        return True

    async def _add_voiceover(self, project: VideoProject) -> None:
        project.status = ProjectStatus.AUDIO
        project.progress = 0.7

        voiceover_text = " ".join(s.voiceover_text for s in project.scenes if s.voiceover_text)
        if not voiceover_text:
            return

        voiceover_path = self._output_dir / f"{project.project_id}_voiceover.wav"

        if self.voice_engine:
            try:
                await self.voice_engine.synthesize(
                    text=voiceover_text,
                    voice=self.config.default_voice,
                    output_path=str(voiceover_path),
                )
                project.voiceover_path = str(voiceover_path)
            except Exception as e:
                logger.warning("Voiceover generation failed: %s", e)

    async def _add_music(self, project: VideoProject) -> None:
        project.progress = 0.8

        style_preset = STYLE_PRESETS.get(project.style, STYLE_PRESETS["cinematic"])
        music_style = style_preset.get("music_style", "ambient")
        music_path = Path(os.path.expanduser(self.config.music_library_path)) / f"{music_style}.mp3"

        if music_path.exists():
            project.music_path = str(music_path)
        else:
            logger.debug("No music file for style '%s', skipping", music_style)

    async def _add_overlays(self, project: VideoProject) -> None:
        project.status = ProjectStatus.OVERLAYS
        project.progress = 0.85

        for scene in project.scenes:
            if scene.overlay_text and scene.render_path:
                await self._burn_overlay(scene)

    async def _burn_overlay(self, scene: Scene) -> None:
        if not scene.overlay_text or not scene.render_path:
            return

        temp_path = scene.render_path.replace(".mp4", "_overlay.mp4")
        cmd = [
            self.config.ffmpeg_path, "-y",
            "-i", scene.render_path,
            "-vf", f"drawtext=text='{scene.overlay_text}':fontcolor=white:fontsize=48:"
                   f"x=(w-text_w)/2:y=h-text_h-50:box=1:boxcolor=black@0.5:boxborderw=10",
            "-c:a", "copy", "-c:v", "libx264", "-pix_fmt", "yuv420p",
            temp_path,
        ]
        try:
            await asyncio.to_thread(
                lambda: subprocess.run(cmd, capture_output=True, timeout=60)
            )
            os.replace(temp_path, scene.render_path)
        except Exception as e:
            logger.warning("Overlay burn failed for scene %d: %s", scene.index, e)

    async def _render_final(self, project: VideoProject) -> None:
        project.status = ProjectStatus.FINALIZING
        project.progress = 0.9

        output_path = self._output_dir / f"{project.project_id}_final.mp4"

        scene_paths = [s.render_path for s in project.scenes if s.render_path and os.path.exists(s.render_path)]
        if not scene_paths:
            raise RuntimeError("No rendered scenes to stitch")

        concat_file = self._output_dir / f"{project.project_id}_concat.txt"
        with open(concat_file, "w") as f:
            for path in scene_paths:
                f.write(f"file '{path}'\n")

        cmd = [
            self.config.ffmpeg_path, "-y",
            "-f", "concat", "-safe", "0", "-i", str(concat_file),
            "-c", "copy", str(output_path),
        ]

        await asyncio.to_thread(
            lambda: subprocess.run(cmd, capture_output=True, timeout=120)
        )

        if project.voiceover_path and os.path.exists(project.voiceover_path):
            voiced_output = str(output_path).replace(".mp4", "_voiced.mp4")
            cmd = [
                self.config.ffmpeg_path, "-y",
                "-i", str(output_path),
                "-i", project.voiceover_path,
                "-c:v", "copy", "-c:a", "aac", "-shortest",
                voiced_output,
            ]
            await asyncio.to_thread(
                lambda: subprocess.run(cmd, capture_output=True, timeout=120)
            )
            os.replace(voiced_output, output_path)

        if project.music_path and os.path.exists(project.music_path):
            music_output = str(output_path).replace(".mp4", "_music.mp4")
            cmd = [
                self.config.ffmpeg_path, "-y",
                "-i", str(output_path),
                "-i", project.music_path,
                "-filter_complex", "[1:a]volume=0.3[bg];[0:a][bg]amix=inputs=2:duration=first[a]",
                "-map", "0:v", "-map", "[a]",
                "-c:v", "copy", "-c:a", "aac",
                music_output,
            ]
            await asyncio.to_thread(
                lambda: subprocess.run(cmd, capture_output=True, timeout=120)
            )
            os.replace(music_output, output_path)

        concat_file.unlink(missing_ok=True)
        project.output_path = str(output_path)
        project.progress = 1.0

    def get_project(self, project_id: str) -> VideoProject | None:
        return self._projects.get(project_id)

    def list_projects(self) -> list[dict[str, Any]]:
        return [
            {
                "project_id": p.project_id,
                "text_description": p.text_description[:100],
                "style": p.style,
                "status": p.status.value,
                "progress": p.progress,
                "output_path": p.output_path,
                "created_at": p.created_at,
                "completed_at": p.completed_at,
            }
            for p in self._projects.values()
        ]

    def get_stats(self) -> dict[str, Any]:
        stats: dict[str, Any] = {
            "total_projects": len(self._projects),
            "completed": sum(1 for p in self._projects.values() if p.status == ProjectStatus.COMPLETE),
            "failed": sum(1 for p in self._projects.values() if p.status == ProjectStatus.FAILED),
            "in_progress": sum(
                1 for p in self._projects.values()
                if p.status not in (ProjectStatus.COMPLETE, ProjectStatus.FAILED)
            ),
        }
        if self._render_cache:
            stats["render_cache"] = self._render_cache.get_stats()
        if self._render_balancer:
            stats["gpu_nodes"] = self._render_balancer.get_gpu_stats()
        if self._render_predictive:
            stats["predictive"] = self._render_predictive.get_stats()
        stats["batch"] = self._render_batch.get_stats()
        return stats

    def get_style_presets(self) -> dict[str, Any]:
        return STYLE_PRESETS

    def _extract_last_frame(self, video_path: str) -> bytes | None:
        """Extract last frame from a video for frame chaining continuity."""
        try:
            frame_path = video_path.replace(".mp4", "_last_frame.png")
            cmd = [
                self.config.ffmpeg_path, "-y",
                "-i", video_path,
                "-vf", "select=eq(n\,0)",
                "-frames:v", "1",
                frame_path,
            ]
            subprocess.run(cmd, capture_output=True, timeout=30)
            if os.path.exists(frame_path):
                with open(frame_path, "rb") as f:
                    return f.read()
        except Exception as e:
            logger.warning("Frame extraction failed: %s", e)
        return None

    def get_gpu_status(self) -> dict[str, Any]:
        """Return current GPU status for frontend display."""
        if self._cloud_gpu and self._cloud_gpu.is_available():
            return {"mode": "cloud", "providers": self._cloud_gpu._providers}
        if self._render_balancer and self._has_gpu_available():
            return {"mode": "local_gpu"}
        return {"mode": "cpu"}
