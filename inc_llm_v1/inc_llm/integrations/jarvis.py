"""Jarvis integration — voice-activated assistant with LLM routing.

Routes voice commands through the incllmv2 harness with auto-detection
for fast reply parameters. The LLM generates responses tuned for speed
on the Jarvis voice channel, with urgency detection based on command
length and keywords.

Auto-detection:
  - Short commands ("time", "weather", "status") → high urgency → fewer tokens
  - Complex commands ("explain", "write", "analyze") → low urgency → more tokens
  - Markdown stripped from response for TTS consumption

Zero-slowdown: urgency detection is O(n) string scan, parameter lookup
is O(1) dict read. Response time tracking is O(1) append.
"""

from __future__ import annotations

import logging
import re
import time
from collections import defaultdict, deque
from typing import Any

from inc_llm.config import JarvisConfig

logger = logging.getLogger(__name__)

MARKDOWN_STRIP_PATTERN = re.compile(
    r"\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|#{1,6}\s|!\[.*?\]\(.*?\)|\[.*?\]\(.*?\)",
    re.DOTALL,
)


class JarvisIntegration:
    """Jarvis voice assistant integration with LLM routing.

    Routes voice commands through the harness with auto-detect fast reply
    tuning. Falls back to stub response if no harness is attached.
    """

    def __init__(self, config: JarvisConfig) -> None:
        self.config = config
        self._active = False
        self._wake_word = "jarvis"
        self._harness = None
        self._command_times: dict[str, deque] = defaultdict(lambda: deque(maxlen=20))
        self._total_commands = 0
        self._total_response_time = 0.0

    def set_harness(self, harness: Any) -> None:
        """Set the LLM harness reference for routing voice commands through the model."""
        self._harness = harness

    @property
    def wake_word(self) -> str:
        return self._wake_word

    def set_wake_word(self, word: str) -> None:
        self._wake_word = word.lower()

    def detect_wake_word(self, text: str) -> bool:
        """Check if the wake word is present in text."""
        return self._wake_word in text.lower()

    def _strip_wake_word(self, text: str) -> str:
        """Remove the wake word from the command text."""
        lowered = text.lower()
        if lowered.startswith(self._wake_word):
            return text[len(self._wake_word):].strip()
        idx = lowered.find(self._wake_word)
        if idx >= 0:
            return text[:idx].strip() + " " + text[idx + len(self._wake_word):].strip()
        return text.strip()

    @staticmethod
    def _strip_markdown(text: str) -> str:
        """Strip markdown formatting from text for TTS consumption."""
        text = MARKDOWN_STRIP_PATTERN.sub(
            lambda m: m.group(1) or m.group(2) or m.group(3) or "", text,
        )
        text = re.sub(r"\n{3,}", "\n\n", text).strip()
        return text

    async def process_command(
        self, text: str, user_id: str = "jarvis_user",
    ) -> dict[str, Any]:
        """Process a Jarvis voice command — routes through the LLM harness.

        Auto-detects urgency from command length and keywords, applies
        precision-tuned parameters for fast voice replies, strips markdown
        from the response for TTS, and tracks response times for speed
        skill creation.

        Falls back to stub response if no harness is attached.
        """
        if not self.config.enabled:
            return {"status": "disabled"}

        self._active = True
        command = self._strip_wake_word(text)
        logger.info("Jarvis command: %s", command[:100])

        if not self._harness:
            return {"status": "ok", "command": command, "processed": True,
                    "response": "Voice assistant ready. Connect to LLM for full responses."}

        t0 = time.time()

        try:
            result = await self._harness.chat_voice(
                user_id=user_id, text=command, channel="jarvis",
            )
            response_text = result.get("response", result.get("message", ""))
            response_time = time.time() - t0

            self._total_commands += 1
            self._total_response_time += response_time

            command_type = self._classify_command(command)
            self._command_times[command_type].append(response_time)

            tts_text = self._strip_markdown(response_text)

            return {
                "status": "ok",
                "command": command,
                "response": response_text,
                "tts_text": tts_text,
                "response_time_s": round(response_time, 3),
                "urgency": result.get("urgency", "normal"),
                "precision_tuned": result.get("precision_tuned", False),
                "command_type": command_type,
            }
        except Exception as e:
            logger.warning("Jarvis LLM call failed: %s", e)
            return {
                "status": "error",
                "command": command,
                "error": str(e),
                "response": "I encountered an error processing that command.",
            }

    @staticmethod
    def _classify_command(text: str) -> str:
        """Classify command type for response time tracking."""
        text_lower = text.lower()
        if any(w in text_lower for w in ("time", "date", "day")):
            return "time"
        if any(w in text_lower for w in ("weather", "temperature", "forecast")):
            return "weather"
        if any(w in text_lower for w in ("status", "system", "health")):
            return "status"
        if any(w in text_lower for w in ("play", "music", "song")):
            return "media"
        if any(w in text_lower for w in ("explain", "what", "how", "why", "tell")):
            return "query"
        if any(w in text_lower for w in ("write", "create", "generate", "build")):
            return "create"
        if any(w in text_lower for w in ("set", "remind", "schedule", "alarm")):
            return "schedule"
        return "general"

    def get_stats(self) -> dict[str, Any]:
        avg_time = self._total_response_time / self._total_commands if self._total_commands > 0 else 0.0
        return {
            "enabled": self.config.enabled,
            "active": self._active,
            "wake_word": self._wake_word,
            "total_commands": self._total_commands,
            "avg_response_time_s": round(avg_time, 3),
            "command_types": {
                cmd_type: {
                    "count": len(times),
                    "avg_time": round(sum(times) / len(times), 3) if times else 0.0,
                }
                for cmd_type, times in self._command_times.items()
            },
        }


class JarvisGamingBridge:
    """Bridge between Jarvis voice assistant and AI Gaming MPC companion mode.

    Enables voice-driven interaction with the AI Gaming MPC companion:
    - Voice commands routed through Jarvis → AI Gaming companion
    - Companion responses spoken back via TTS
    - Emotional state awareness in voice responses
    - Game control via voice (start game, change strategy, etc.)
    - Companion personality reflected in voice tone
    """

    def __init__(self, jarvis: JarvisIntegration, ai_gaming: Any) -> None:
        self.jarvis = jarvis
        self.ai_gaming = ai_gaming
        self._companion_active = False
        self._voice_companion_stats = {
            "total_voice_interactions": 0,
            "total_game_commands": 0,
            "total_companion_chats": 0,
            "emotional_responses": 0,
        }

    async def process_voice_command(
        self, text: str, user_id: str = "jarvis_gaming",
    ) -> dict[str, Any]:
        """Process a voice command with AI Gaming MPC companion awareness."""
        self._companion_active = True
        self._voice_companion_stats["total_voice_interactions"] += 1

        command = text.lower().strip()
        wake = self.jarvis.wake_word
        if wake in command:
            command = self.jarvis._strip_wake_word(text).lower().strip()

        if self._is_game_command(command):
            return await self._handle_game_command(command, user_id)
        elif self._is_companion_command(command):
            return await self._handle_companion_chat(command, user_id)
        else:
            return await self.jarvis.process_command(text, user_id)

    async def _handle_game_command(self, command: str, user_id: str) -> dict[str, Any]:
        """Handle a game-related voice command."""
        self._voice_companion_stats["total_game_commands"] += 1

        if not self.ai_gaming:
            return await self.jarvis.process_command(command, user_id)

        try:
            emotional_state = self.ai_gaming.get_emotional_state() if hasattr(self.ai_gaming, "get_emotional_state") else {}
            companion_profile = self.ai_gaming.get_companion_profile() if hasattr(self.ai_gaming, "get_companion_profile") else {}

            context = f"Voice command from companion. Emotional state: {emotional_state}. "
            if companion_profile:
                context += f"Personality: {companion_profile.get('personality_traits', [])}. "

            result = await self.ai_gaming.process_companion_command(
                command=command,
                user_id=user_id,
                context=context,
                voice_mode=True,
            ) if hasattr(self.ai_gaming, "process_companion_command") else None

            if result:
                response_text = result.get("response", result.get("message", ""))
                tts_text = self.jarvis._strip_markdown(response_text)
                return {
                    "status": "ok",
                    "command": command,
                    "response": response_text,
                    "tts_text": tts_text,
                    "mode": "game",
                    "emotional_state": emotional_state,
                    "companion_response": True,
                }
        except Exception as e:
            logger.warning("Game command handling failed: %s", e)

        return await self.jarvis.process_command(command, user_id)

    async def _handle_companion_chat(self, command: str, user_id: str) -> dict[str, Any]:
        """Handle a companion chat voice command."""
        self._voice_companion_stats["total_companion_chats"] += 1

        if not self.ai_gaming:
            return await self.jarvis.process_command(command, user_id)

        try:
            emotional_state = self.ai_gaming.get_emotional_state() if hasattr(self.ai_gaming, "get_emotional_state") else {}

            result = await self.ai_gaming.companion_chat(
                message=command,
                user_id=user_id,
                voice_mode=True,
            ) if hasattr(self.ai_gaming, "companion_chat") else None

            if result:
                response_text = result.get("response", result.get("message", ""))
                tts_text = self.jarvis._strip_markdown(response_text)

                mood = emotional_state.get("mood", "neutral") if emotional_state else "neutral"
                if mood in ("excited", "happy", "energetic"):
                    self._voice_companion_stats["emotional_responses"] += 1

                return {
                    "status": "ok",
                    "command": command,
                    "response": response_text,
                    "tts_text": tts_text,
                    "mode": "companion",
                    "emotional_state": emotional_state,
                    "companion_response": True,
                }
        except Exception as e:
            logger.warning("Companion chat handling failed: %s", e)

        return await self.jarvis.process_command(command, user_id)

    @staticmethod
    def _is_game_command(text: str) -> bool:
        """Check if a command is game-related."""
        game_keywords = [
            "play game", "start game", "pause game", "stop game",
            "game strategy", "next move", "restart", "level up",
            "win", "lose", "score", "high score", "achievement",
            "mission", "quest", "battle", "fight", "attack",
            "defend", "build", "gather", "explore", "craft",
        ]
        return any(kw in text for kw in game_keywords)

    @staticmethod
    def _is_companion_command(text: str) -> bool:
        """Check if a command is companion chat."""
        companion_keywords = [
            "hey", "hello", "how are you", "what do you think",
            "let's talk", "chat", "tell me about", "what's up",
            "how do you feel", "what's your", "do you like",
            "remember when", "you know", "i think", "i feel",
        ]
        return any(kw in text for kw in companion_keywords)

    def get_stats(self) -> dict[str, Any]:
        return {
            "companion_active": self._companion_active,
            **self._voice_companion_stats,
            "jarvis_stats": self.jarvis.get_stats(),
        }
