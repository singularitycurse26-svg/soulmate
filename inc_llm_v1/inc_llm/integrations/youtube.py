"""YouTube video understanding integration with LLM-powered analysis.

Accepts a YouTube URL, extracts transcript (via youtube-transcript-api with
Whisper fallback), fetches metadata via yt-dlp, sends to LLM for structured
analysis (summary, key notes, actionable insights), auto-creates skills,
stores in RAG ChromaDB, and shares via universal recursive link.

Self-improving: YouTubeSkillCreator tracks topics with Bayesian scoring,
dynamically adjusts analysis prompts based on past feedback, creates
pattern skills (3+ videos same topic) and meta-skills (5+ total videos).

Zero-slowdown: all post-analysis self-improvement runs via asyncio.create_task.
Transcript fetching uses asyncio.to_thread to avoid blocking the event loop.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import tempfile
import time
from typing import Any

from inc_llm.config import YouTubeConfig

logger = logging.getLogger(__name__)

VIDEO_ID_PATTERNS = [
    re.compile(r"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/|youtube\.com/shorts/)([a-zA-Z0-9_-]{11})"),
    re.compile(r"^([a-zA-Z0-9_-]{11})$"),
]

ANALYSIS_PROMPT_TEMPLATE = """You are a YouTube video analysis system. Analyze the following video transcript and metadata.

Video Title: {title}
Channel: {channel}
Duration: {duration}s

Transcript (first {max_chars} chars):
{transcript}

{emphasis_instructions}

Return ONLY valid JSON with this structure:
{{
  "summary": "2-3 paragraph summary of the video content",
  "key_notes": ["bullet point 1", "bullet point 2", ...],
  "actionable_insights": ["what can be built/implemented from this", ...],
  "topics": ["topic1", "topic2", ...],
  "skill_name": "kebab-case-name-for-skill",
  "skill_description": "one sentence describing the skill",
  "skill_category": "youtube_knowledge",
  "skill_content": "full skill content with steps, details, and code examples if applicable",
  "trigger_conditions": ["when this knowledge is relevant", ...]
}}

Be thorough and precise. Extract the most valuable knowledge."""


class YouTubeIntegration:
    """YouTube video understanding integration with LLM-powered analysis."""

    def __init__(self, config: YouTubeConfig) -> None:
        self.config = config
        self._harness: Any = None
        self._skill_creator: Any = None
        self._cache: dict[str, dict[str, Any]] = {}
        self._stats = {
            "total_videos": 0,
            "transcript_api_count": 0,
            "whisper_count": 0,
            "metadata_only_count": 0,
            "skills_created": 0,
            "total_analysis_time": 0.0,
        }

    def set_harness(self, harness: Any) -> None:
        self._harness = harness

    def set_skill_creator(self, skill_creator: Any) -> None:
        self._skill_creator = skill_creator

    async def analyze_video(
        self,
        url: str,
        user_id: str = "youtube_user",
        extract_transcript: bool = True,
        create_skill: bool = True,
        share_via_link: bool = True,
    ) -> dict[str, Any]:
        """Main entry point — analyze a YouTube video."""
        t0 = time.time()
        video_id = self._extract_video_id(url)
        if not video_id:
            return {"status": "error", "error": f"Could not extract video ID from URL: {url}"}

        cache_key = video_id
        if cache_key in self._cache:
            cached = self._cache[cache_key]
            if time.time() - cached["cached_at"] < self.config.cache_ttl_s:
                cached["from_cache"] = True
                return cached

        metadata: dict[str, Any] = {}
        transcript_data: dict[str, Any] = {}

        try:
            metadata = await self._fetch_metadata(video_id)
        except Exception as e:
            logger.warning("Metadata fetch failed for %s: %s", video_id, e)

        if extract_transcript:
            try:
                transcript_data = await self._fetch_transcript(video_id)
            except Exception as e:
                logger.warning("Transcript fetch failed for %s: %s", video_id, e)
                if self.config.whisper_fallback:
                    try:
                        transcript_data = await self._fetch_transcript_whisper_fallback(video_id)
                    except Exception as e2:
                        logger.warning("Whisper fallback failed for %s: %s", video_id, e2)

        transcript_text = transcript_data.get("text", "")
        source = transcript_data.get("source", "none")

        if source == "transcript_api":
            self._stats["transcript_api_count"] += 1
        elif source == "whisper":
            self._stats["whisper_count"] += 1
        else:
            self._stats["metadata_only_count"] += 1

        if not transcript_text and not metadata:
            return {"status": "error", "error": "Could not fetch any content from the video"}

        analysis = await self._analyze_with_llm(transcript_text, metadata, user_id)

        if not analysis:
            analysis = {
                "summary": metadata.get("description", "No analysis available.")[:500],
                "key_notes": [],
                "actionable_insights": [],
                "topics": [],
                "skill_name": f"youtube-{video_id}",
                "skill_description": f"Knowledge from video: {metadata.get('title', video_id)}",
                "skill_category": "youtube_knowledge",
                "skill_content": transcript_text[:2000] if transcript_text else metadata.get("description", ""),
                "trigger_conditions": [],
            }

        skill_result = None
        if create_skill and self.config.auto_create_skill:
            try:
                skill_result = await self._create_skill_from_video(analysis, metadata, transcript_text)
                if skill_result.get("success"):
                    self._stats["skills_created"] += 1
            except Exception as e:
                logger.warning("Skill creation failed: %s", e)

        if self.config.store_in_rag:
            try:
                await self._store_in_rag(video_id, analysis, transcript_text)
            except Exception as e:
                logger.warning("RAG storage failed: %s", e)

        if share_via_link and self.config.share_via_universal_link and skill_result:
            try:
                await self._share_via_link(skill_result, analysis, metadata, video_id)
            except Exception as e:
                logger.warning("Link sharing failed: %s", e)

        if self._skill_creator:
            try:
                asyncio.create_task(
                    self._skill_creator.record_analysis(
                        video_id=video_id,
                        topics=analysis.get("topics", []),
                        emphasis=analysis.get("_emphasis", "general"),
                        detail_level=analysis.get("_detail_level", "moderate"),
                        skill_name=analysis.get("skill_name", ""),
                        title=metadata.get("title", ""),
                        channel=metadata.get("channel", ""),
                    )
                )
            except Exception:
                pass

        elapsed = time.time() - t0
        self._stats["total_videos"] += 1
        self._stats["total_analysis_time"] += elapsed

        result = {
            "status": "ok",
            "video_id": video_id,
            "url": url,
            "title": metadata.get("title", ""),
            "channel": metadata.get("channel", ""),
            "transcript_source": source,
            "summary": analysis.get("summary", ""),
            "key_notes": analysis.get("key_notes", []),
            "actionable_insights": analysis.get("actionable_insights", []),
            "topics": analysis.get("topics", []),
            "skill_name": analysis.get("skill_name", ""),
            "skill_created": skill_result.get("success", False) if skill_result else False,
            "analysis_time_s": round(elapsed, 2),
            "from_cache": False,
            "cached_at": time.time(),
        }

        self._cache[cache_key] = result
        return result

    async def _fetch_transcript(self, video_id: str) -> dict[str, Any]:
        """Fetch transcript using youtube-transcript-api."""
        def _fetch() -> dict[str, Any]:
            from youtube_transcript_api import YouTubeTranscriptApi
            ytt_api = YouTubeTranscriptApi()
            languages = self.config.languages + [None]
            for lang in languages:
                try:
                    if lang:
                        transcript_list = ytt_api.fetch(video_id, languages=[lang])
                    else:
                        transcript_list = ytt_api.fetch(video_id)
                    segments = []
                    text_parts = []
                    for snippet in transcript_list:
                        segments.append({
                            "start": snippet.start,
                            "duration": snippet.duration,
                            "text": snippet.text,
                        })
                        text_parts.append(snippet.text)
                    full_text = " ".join(text_parts)
                    if self.config.max_transcript_length > 0:
                        full_text = full_text[: self.config.max_transcript_length]
                    return {"text": full_text, "segments": segments, "source": "transcript_api"}
                except Exception:
                    continue
            raise RuntimeError("No transcript found in any language")

        return await asyncio.to_thread(_fetch)

    async def _fetch_transcript_whisper_fallback(self, video_id: str) -> dict[str, Any]:
        """Download audio via yt-dlp, transcribe with Whisper."""
        def _download_audio() -> str:
            import subprocess
            tmp_dir = tempfile.mkdtemp(prefix="yt_audio_")
            output_template = os.path.join(tmp_dir, "%(id)s.%(ext)s")
            cmd = [
                "yt-dlp", "--no-playlist", "--extract-audio",
                "--audio-format", "wav", "-o", output_template,
                f"https://www.youtube.com/watch?v={video_id}",
            ]
            subprocess.run(cmd, capture_output=True, timeout=300, check=True)
            for fname in os.listdir(tmp_dir):
                if fname.endswith(".wav"):
                    return os.path.join(tmp_dir, fname)
            raise RuntimeError("No audio file downloaded")

        audio_path = await asyncio.to_thread(_download_audio)
        try:
            if self._harness and self._harness.voice:
                result = await self._harness.voice.transcribe(audio_path)
                text = result.get("text", "") if isinstance(result, dict) else str(result)
                if self.config.max_transcript_length > 0:
                    text = text[: self.config.max_transcript_length]
                return {"text": text, "segments": [], "source": "whisper"}
            raise RuntimeError("No voice engine available for Whisper transcription")
        finally:
            try:
                os.remove(audio_path)
                os.rmdir(os.path.dirname(audio_path))
            except OSError:
                pass

    async def _fetch_metadata(self, video_id: str) -> dict[str, Any]:
        """Fetch video metadata via yt-dlp --dump-json."""
        def _fetch() -> dict[str, Any]:
            import subprocess
            cmd = [
                "yt-dlp", "--no-playlist", "--dump-json",
                f"https://www.youtube.com/watch?v={video_id}",
            ]
            result = subprocess.run(cmd, capture_output=True, timeout=60, text=True)
            if result.returncode != 0 or not result.stdout.strip():
                raise RuntimeError(f"yt-dlp failed: {result.stderr[:200]}")
            data = json.loads(result.stdout.strip())
            return {
                "title": data.get("title", ""),
                "description": data.get("description", ""),
                "channel": data.get("channel", data.get("uploader", "")),
                "duration": data.get("duration", 0),
                "upload_date": data.get("upload_date", ""),
                "tags": data.get("tags", []),
                "view_count": data.get("view_count", 0),
                "like_count": data.get("like_count", 0),
            }

        return await asyncio.to_thread(_fetch)

    async def _analyze_with_llm(
        self, transcript: str, metadata: dict, user_id: str
    ) -> dict[str, Any]:
        """Send transcript + metadata to LLM harness for analysis."""
        if not self._harness:
            return {}

        topics_hint = metadata.get("tags", [])
        emphasis = "general"
        detail_level = "moderate"
        extra_instructions = ""

        if self._skill_creator:
            try:
                params = self._skill_creator.get_optimal_analysis_params(topics_hint)
                emphasis = params.get("emphasis", "general")
                detail_level = params.get("detail_level", "moderate")
                extra_instructions = params.get("extra_instructions", "")
            except Exception:
                pass

        emphasis_text = self._build_emphasis_text(emphasis, detail_level, extra_instructions)
        max_chars = min(len(transcript), 15000)
        prompt = ANALYSIS_PROMPT_TEMPLATE.format(
            title=metadata.get("title", "Unknown"),
            channel=metadata.get("channel", "Unknown"),
            duration=metadata.get("duration", 0),
            transcript=transcript[:max_chars] if transcript else "(no transcript available — use metadata description)",
            max_chars=max_chars,
            emphasis_instructions=emphasis_text,
        )

        try:
            result = await self._harness.chat_agent(
                user_id=user_id,
                task=prompt,
                channel="youtube",
            )
            response_text = result.get("response", result.get("message", ""))
            parsed = self._parse_json_response(response_text)
            if parsed:
                parsed["_emphasis"] = emphasis
                parsed["_detail_level"] = detail_level
                return parsed
            return {
                "summary": response_text[:1000] if response_text else "",
                "key_notes": [],
                "actionable_insights": [],
                "topics": topics_hint,
                "skill_name": f"youtube-{metadata.get('title', 'video').lower().replace(' ', '-')[:30]}",
                "skill_description": f"Knowledge from: {metadata.get('title', 'YouTube video')}",
                "skill_category": "youtube_knowledge",
                "skill_content": response_text[:2000] if response_text else "",
                "trigger_conditions": [],
                "_emphasis": emphasis,
                "_detail_level": detail_level,
            }
        except Exception as e:
            logger.warning("LLM analysis failed: %s", e)
            return {}

    def _build_emphasis_text(self, emphasis: str, detail_level: str, extra: str) -> str:
        parts = []
        if emphasis == "code_examples":
            parts.append("Focus on extracting code examples, implementation details, and technical specifics.")
        elif emphasis == "step_by_step":
            parts.append("Focus on extracting step-by-step instructions and procedural knowledge.")
        elif emphasis == "pros_cons":
            parts.append("Focus on extracting pros/cons, comparisons, and evaluative insights.")
        elif emphasis == "key_concepts":
            parts.append("Focus on extracting key concepts, definitions, and theoretical frameworks.")
        else:
            parts.append("Extract the most important knowledge from this video.")

        if detail_level == "detailed":
            parts.append("Be very detailed and thorough — include all important nuances.")
        elif detail_level == "concise":
            parts.append("Be concise — only the most critical points.")

        if extra:
            parts.append(extra)

        return "\n".join(parts)

    @staticmethod
    def _parse_json_response(text: str) -> dict[str, Any] | None:
        """Extract JSON from LLM response text."""
        if not text:
            return None
        json_start = text.find("{")
        json_end = text.rfind("}")
        if json_start >= 0 and json_end > json_start:
            try:
                return json.loads(text[json_start : json_end + 1])
            except json.JSONDecodeError:
                pass
        return None

    async def _create_skill_from_video(
        self, analysis: dict, metadata: dict, transcript: str
    ) -> dict[str, Any]:
        """Create a skill from the video analysis."""
        if not self._harness or not self._harness.skill_manager:
            return {"success": False, "error": "No skill manager available"}

        skill_name = analysis.get("skill_name", f"youtube-{metadata.get('title', 'video').lower().replace(' ', '-')[:30]}")
        skill_name = re.sub(r"[^a-z0-9-]", "-", skill_name.lower()).strip("-")

        result = self._harness.skill_manager.create(
            name=skill_name,
            description=analysis.get("skill_description", f"Knowledge from: {metadata.get('title', 'YouTube video')}"),
            content=analysis.get("skill_content", ""),
            category=analysis.get("skill_category", "youtube_knowledge"),
            trigger_conditions=analysis.get("trigger_conditions", []),
        )

        return {
            "success": result.success,
            "skill_name": skill_name,
            "message": result.message,
        }

    async def _store_in_rag(self, video_id: str, analysis: dict, transcript: str) -> None:
        """Store the video knowledge in the RAG ChromaDB collection."""
        if not self._harness or not self._harness.rag:
            return

        rag = self._harness.rag
        if rag._collection is None:
            return

        doc = (
            f"Summary: {analysis.get('summary', '')}\n"
            f"Key Notes: {json.dumps(analysis.get('key_notes', []))}\n"
            f"Actionable Insights: {json.dumps(analysis.get('actionable_insights', []))}"
        )
        meta = {
            "source": "youtube",
            "video_id": video_id,
            "url": f"https://www.youtube.com/watch?v={video_id}",
            "title": analysis.get("_title", ""),
            "channel": analysis.get("_channel", ""),
            "topics": json.dumps(analysis.get("topics", [])),
        }

        def _upsert():
            rag._collection.upsert(
                ids=[f"youtube_{video_id}"],
                documents=[doc],
                metadatas=[meta],
            )

        await asyncio.to_thread(_upsert)

    async def _share_via_link(
        self, skill_data: dict, analysis: dict, metadata: dict, video_id: str
    ) -> None:
        """Share the skill via UniversalLinkManager."""
        if not self._harness or not self._harness.universal_link:
            return

        content = json.dumps({
            "skill_name": skill_data.get("skill_name", ""),
            "summary": analysis.get("summary", ""),
            "key_notes": analysis.get("key_notes", []),
            "actionable_insights": analysis.get("actionable_insights", []),
            "skill_content": analysis.get("skill_content", ""),
            "topics": analysis.get("topics", []),
        })

        self._harness.universal_link.share_learning(
            learning_type="skill",
            content=content,
            metadata={
                "source": "youtube",
                "video_id": video_id,
                "title": metadata.get("title", ""),
                "channel": metadata.get("channel", ""),
            },
        )

    @staticmethod
    def _extract_video_id(url: str) -> str | None:
        """Extract video ID from various YouTube URL formats."""
        for pattern in VIDEO_ID_PATTERNS:
            match = pattern.search(url.strip())
            if match:
                return match.group(1)
        return None

    async def export_dataset(self, format: str = "jsonl") -> str:
        """Export all YouTube video knowledge as a training dataset."""
        if not self._harness or not self._harness.rag:
            return ""

        rag = self._harness.rag
        if rag._collection is None:
            return ""

        def _query():
            return rag._collection.get(where={"source": "youtube"})

        results = await asyncio.to_thread(_query)

        if not results or not results.get("ids"):
            return ""

        lines: list[str] = []
        ids = results.get("ids", [])
        docs = results.get("documents", [])
        metas = results.get("metadatas", [])

        for doc_id, doc, meta in zip(ids, docs, metas):
            video_id = meta.get("video_id", doc_id.replace("youtube_", ""))
            entry = {
                "instruction": "Summarize the key knowledge from this YouTube video",
                "input": f"{meta.get('title', 'Unknown')} — {doc[:500]}",
                "output": doc,
                "metadata": {
                    "video_id": video_id,
                    "url": meta.get("url", f"https://www.youtube.com/watch?v={video_id}"),
                    "channel": meta.get("channel", ""),
                    "topics": json.loads(meta.get("topics", "[]")),
                },
            }
            lines.append(json.dumps(entry))

        return "\n".join(lines)

    def get_stats(self) -> dict[str, Any]:
        avg_time = (
            self._stats["total_analysis_time"] / self._stats["total_videos"]
            if self._stats["total_videos"] > 0
            else 0.0
        )
        return {
            "total_videos": self._stats["total_videos"],
            "cache_size": len(self._cache),
            "transcript_api_count": self._stats["transcript_api_count"],
            "whisper_count": self._stats["whisper_count"],
            "metadata_only_count": self._stats["metadata_only_count"],
            "skills_created": self._stats["skills_created"],
            "avg_analysis_time_s": round(avg_time, 2),
        }
