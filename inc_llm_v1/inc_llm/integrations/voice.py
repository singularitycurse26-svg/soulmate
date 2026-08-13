"""Voice engine — TTS (text-to-speech) and STT (speech-to-text).

Uses edge-tts for TTS (free, high-quality Microsoft Edge neural voices)
and whisper for STT (local, offline). Falls back gracefully when
libraries are not installed.
"""

from __future__ import annotations

import asyncio
import logging
import os
import tempfile
import time
from typing import Any, AsyncIterator

from inc_llm.config import VoiceConfig

logger = logging.getLogger(__name__)


class VoiceEngine:
    """TTS + STT voice engine."""

    def __init__(self, config: VoiceConfig) -> None:
        self.config = config
        self._tts_available = False
        self._stt_available = False
        self._check_availability()

    def _check_availability(self) -> None:
        try:
            import edge_tts  # noqa: F401
            self._tts_available = True
        except ImportError:
            logger.info("edge-tts not installed, TTS disabled")
        try:
            import whisper  # noqa: F401
            self._stt_available = True
        except ImportError:
            logger.info("whisper not installed, STT disabled")

    async def synthesize(self, text: str, output_path: str | None = None) -> dict[str, Any]:
        """Convert text to speech."""
        if not self.config.enabled or not self._tts_available:
            return {"status": "disabled", "error": "TTS not available"}

        if output_path is None:
            output_path = os.path.join(tempfile.gettempdir(), f"tts_{int(time.time())}.mp3")

        try:
            import edge_tts

            communicate = edge_tts.Communicate(
                text, self.config.voice_profile,
                rate=f"+{int((self.config.speed - 1) * 100)}%" if self.config.speed > 1 else "0%",
            )
            await communicate.save(output_path)
            return {"status": "ok", "file": output_path, "duration_s": len(text) / 15.0}
        except Exception as e:
            logger.warning("TTS failed: %s", e)
            return {"status": "error", "error": str(e)}

    async def transcribe(self, audio_path: str) -> dict[str, Any]:
        """Convert speech to text."""
        if not self.config.enabled or not self._stt_available:
            return {"status": "disabled", "error": "STT not available"}

        try:
            import whisper

            def _transcribe():
                model = whisper.load_model("base")
                result = model.transcribe(audio_path)
                return result.get("text", "")

            text = await asyncio.to_thread(_transcribe)
            return {"status": "ok", "text": text}
        except Exception as e:
            logger.warning("STT failed: %s", e)
            return {"status": "error", "error": str(e)}

    async def stream_synthesize(self, text: str) -> AsyncIterator[bytes]:
        """Stream TTS audio chunks."""
        if not self.config.enabled or not self._tts_available:
            return
        try:
            import edge_tts
            communicate = edge_tts.Communicate(text, self.config.voice_profile)
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    yield chunk["data"]
        except Exception as e:
            logger.warning("Stream TTS failed: %s", e)

    def get_stats(self) -> dict[str, Any]:
        return {
            "enabled": self.config.enabled,
            "tts_available": self._tts_available,
            "stt_available": self._stt_available,
            "tts_engine": self.config.tts_engine,
            "stt_engine": self.config.stt_engine,
            "voice_profile": self.config.voice_profile,
        }
