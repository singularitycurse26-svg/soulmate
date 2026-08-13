"""Conversation skill creation — watches how users talk and creates conversation skills.

Every conversation makes incllmv2 better at conversating. It watches:
- User's communication style (casual, formal, technical, playful)
- Tone, formality, slang, sentence length, emoji usage
- Response patterns that got positive reactions (follow-up questions, continued engagement)
- Conversation flow patterns (topic transitions, depth preferences)
- Language patterns (vocabulary level, sentence structure)

Creates "conversation skills" that adjust tone, length, and style of future responses.
These skills are shared via the universal recursive link — all instances learn.

Zero-slowdown: runs AFTER the response is sent, in a background task.
Never touches the LLM inference pipeline.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import time
from typing import Any

from inc_llm.memory.manager import MemoryManager
from inc_llm.skills.skill_manager import SkillManager

logger = logging.getLogger(__name__)


class ConversationSkillCreator:
    """Creates conversation skills from user interactions.

    Runs post-turn in background — zero-slowdown.
    """

    def __init__(self, memory: MemoryManager, skill_manager: SkillManager) -> None:
        self.memory = memory
        self.skill_manager = skill_manager
        self._style_cache: dict[str, dict[str, Any]] = {}

    async def analyze_and_learn(
        self, user_id: str, user_message: str, assistant_response: str,
        session_id: str = "", follow_up: bool = False,
    ) -> dict[str, Any]:
        """Analyze a conversation turn and create/update conversation skills.

        Called AFTER response is sent — background task, zero-slowdown.
        """
        user_style = self._analyze_user_style(user_message)
        response_quality = self._analyze_response_quality(user_message, assistant_response)

        style_key = self._style_key(user_style)
        if style_key in self._style_cache:
            cached = self._style_cache[style_key]
            cached["interactions"] += 1
            cached["last_seen"] = time.time()
            if follow_up:
                cached["positive_reactions"] += 1
        else:
            self._style_cache[style_key] = {
                "style": user_style,
                "interactions": 1,
                "positive_reactions": 1 if follow_up else 0,
                "first_seen": time.time(),
                "last_seen": time.time(),
            }

        if self._style_cache[style_key]["interactions"] >= 3:
            return await self._create_or_update_skill(user_id, user_style, response_quality, style_key)

        return {"status": "collecting", "interactions": self._style_cache[style_key]["interactions"]}

    def _analyze_user_style(self, message: str) -> dict[str, Any]:
        """Analyze the user's communication style from their message."""
        words = message.split()
        sentences = re.split(r"[.!?]+", message)
        sentences = [s.strip() for s in sentences if s.strip()]

        avg_sentence_len = sum(len(s.split()) for s in sentences) / max(len(sentences), 1)
        avg_word_len = sum(len(w) for w in words) / max(len(words), 1)

        slang_markers = len(re.findall(
            r"\b(yeah|yep|nope|gonna|wanna|gotta|kinda|sorta|dunno|yeah|uh|haha|lol|btw|tbh|imo|ngl)\b",
            message, re.IGNORECASE,
        ))
        formal_markers = len(re.findall(
            r"\b(therefore|however|furthermore|nevertheless|accordingly|consequently|subsequently)\b",
            message, re.IGNORECASE,
        ))
        emoji_count = len(re.findall(r"[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF]", message))
        question_count = message.count("?")
        exclamation_count = message.count("!")
        code_blocks = len(re.findall(r"```", message)) // 2
        technical_terms = len(re.findall(
            r"\b(function|class|async|await|import|export|api|endpoint|database|query|cache|deploy|docker|kubernetes)\b",
            message, re.IGNORECASE,
        ))

        if formal_markers > slang_markers and avg_word_len > 5:
            formality = "formal"
        elif slang_markers > formal_markers or emoji_count > 0:
            formality = "casual"
        else:
            formality = "neutral"

        if code_blocks > 0 or technical_terms > 3:
            topic = "technical"
        elif question_count > 2:
            topic = "inquisitive"
        else:
            topic = "general"

        return {
            "formality": formality,
            "topic": topic,
            "avg_sentence_length": round(avg_sentence_len, 1),
            "avg_word_length": round(avg_word_len, 1),
            "emoji_usage": emoji_count > 0,
            "question_heavy": question_count > 2,
            "exclamation_heavy": exclamation_count > 2,
            "uses_code_blocks": code_blocks > 0,
            "technical_level": "high" if technical_terms > 3 else "medium" if technical_terms > 0 else "low",
            "verbosity": "verbose" if len(words) > 50 else "moderate" if len(words) > 15 else "concise",
        }

    def _analyze_response_quality(self, user_message: str, assistant_response: str) -> dict[str, Any]:
        """Analyze the quality of the assistant's response."""
        resp_words = assistant_response.split()
        has_code = "```" in assistant_response
        has_explanation = any(
            word in assistant_response.lower()
            for word in ("because", "since", "due to", "this means", "this works", "the reason")
        )
        is_concise = len(resp_words) < 100
        is_detailed = len(resp_words) > 200
        has_examples = "example" in assistant_response.lower() or "for instance" in assistant_response.lower()

        return {
            "response_length": len(resp_words),
            "has_code": has_code,
            "has_explanation": has_explanation,
            "is_concise": is_concise,
            "is_detailed": is_detailed,
            "has_examples": has_examples,
        }

    def _style_key(self, style: dict[str, Any]) -> str:
        """Generate a cache key from style attributes."""
        return f"{style['formality']}_{style['topic']}_{style['verbosity']}_{style['technical_level']}"

    async def _create_or_update_skill(
        self, user_id: str, style: dict[str, Any], response_quality: dict[str, Any],
        style_key: str,
    ) -> dict[str, Any]:
        """Create or update a conversation skill."""
        skill_name = f"conversation-{style['formality']}-{style['topic']}-{style['verbosity']}"

        existing = self.skill_manager.memory.semantic.get_skill(skill_name)
        if existing:
            updated_content = self._build_skill_content(style, response_quality, existing.content)
            self.skill_manager.update(skill_name, content=updated_content)
            logger.info("Updated conversation skill: %s", skill_name)
            return {"status": "updated", "skill_name": skill_name}

        content = self._build_skill_content(style, response_quality, "")
        result = self.skill_manager.create(
            name=skill_name,
            description=f"Conversation style: {style['formality']} {style['topic']} ({style['verbosity']})",
            content=content,
            category="conversation",
            trigger_conditions=[
                f"user speaks in {style['formality']} tone",
                f"topic is {style['topic']}",
                f"user is {style['verbosity']}",
            ],
        )

        if result.success:
            logger.info("Created conversation skill: %s", skill_name)
            return {"status": "created", "skill_name": skill_name}
        return {"status": "error", "message": result.message}

    def _build_skill_content(
        self, style: dict[str, Any], quality: dict[str, Any], existing: str,
    ) -> str:
        """Build the skill content describing how to respond to this user style."""
        guidelines = []

        if style["formality"] == "casual":
            guidelines.append("- Use casual, friendly tone — match the user's relaxed style")
            guidelines.append("- Contractions are fine (don't, can't, won't)")
            if style.get("emoji_usage"):
                guidelines.append("- Light emoji use is acceptable to match user's style")
        elif style["formality"] == "formal":
            guidelines.append("- Use formal, professional tone")
            guidelines.append("- Avoid contractions in formal contexts")
            guidelines.append("- Use complete sentences with proper structure")
        else:
            guidelines.append("- Use neutral tone — neither overly casual nor stiff")

        if style["verbosity"] == "concise":
            guidelines.append("- Keep responses short and to the point")
            guidelines.append("- Don't over-explain — the user gets it quickly")
        elif style["verbosity"] == "verbose":
            guidelines.append("- Provide thorough, detailed responses")
            guidelines.append("- The user appreciates comprehensive explanations")

        if style["technical_level"] == "high":
            guidelines.append("- Use technical terminology freely — the user is technical")
            guidelines.append("- Skip basic explanations of well-known concepts")
        elif style["technical_level"] == "low":
            guidelines.append("- Explain technical terms when used")
            guidelines.append("- Use analogies to make concepts accessible")

        if style.get("question_heavy"):
            guidelines.append("- The user asks lots of questions — be patient and answer each one")
            guidelines.append("- Anticipate follow-up questions and address them proactively")

        if style.get("uses_code_blocks"):
            guidelines.append("- The user works with code — provide code examples when relevant")

        if quality.get("has_explanation") and quality.get("is_concise"):
            guidelines.append("- Brief explanations work well — keep reasoning concise but clear")
        elif quality.get("is_detailed"):
            guidelines.append("- Detailed responses are well-received — don't be afraid to elaborate")

        content = f"Conversation Style Guide ({style['formality']}/{style['topic']}):\n"
        content += "\n".join(guidelines)
        content += f"\n\nLearned from {self._style_cache.get(self._style_key(style), {}).get('interactions', 0)} interactions."
        return content

    def get_user_style_profile(self, user_id: str) -> dict[str, Any]:
        """Get the current style profile for a user (for debugging/dashboard)."""
        return {
            "cached_styles": {
                k: {
                    "style": v["style"],
                    "interactions": v["interactions"],
                    "positive_reactions": v["positive_reactions"],
                }
                for k, v in self._style_cache.items()
            },
            "total_styles_learned": len(self._style_cache),
        }
