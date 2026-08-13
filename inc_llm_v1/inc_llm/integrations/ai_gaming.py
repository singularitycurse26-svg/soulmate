"""AI Gaming MPC integration for incllmv2.

A realistic AI companion that lives in an app — handles everything you ask
with no limitations as an AI assistant, and can also leave the app to go
play games. Tied directly to the incllmv2 harness for full intelligence.

The AI Gaming MPC is not just a game AI — it's a complete AI person:
- Companion mode: persistent personality, emotional state, relationship building
- Assistant mode: handles any request like the main LLM (no limitations)
- Autonomous mode: independently decides to play games, interact with worlds
- Game playing: strategy, RPG, sandbox, competitive, cooperative games
- Personality system: configurable traits that affect dialogue and decisions
- Emotional state: mood, excitement, frustration affect response style
- Relationship tracking: remembers shared experiences, inside jokes, preferences

Pairing flow (like Telegram):
1. User calls /v1/ai-gaming/pair → generates 6-digit pairing code
2. User enters code in AI Gaming MPC app
3. MPC app calls /v1/ai-gaming/confirm with code + their API token
4. Connection established — companion is live in the app

Zero-slowdown: all operations are async, isolated from LLM pipeline.
Channel profile in auto_tuner: 'ai_gaming' — 128 tokens, stream=True, temp=0.6.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import sqlite3
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from inc_llm.math_core.geometry import GeometryMath, Vec3

logger = logging.getLogger(__name__)

EMOTION_ENERGY_DECAY = 0.95
EMOTION_EXCITEMENT_BOOST = 1.2
EMOTION_FRUSTRATION_DECAY = 0.9
RELATIONSHIP_GAIN_POSITIVE = 0.02
RELATIONSHIP_GAIN_SHARED = 0.05
RELATIONSHIP_LOSS_NEGATIVE = 0.03
MAX_RELATIONSHIP = 100.0

GAME_TYPES = frozenset({
    "strategy", "rpg", "sandbox", "competitive", "cooperative",
    "puzzle", "simulation", "adventure", "card", "board",
})

PERSONALITY_TRAITS = frozenset({
    "friendly", "competitive", "analytical", "creative", "cautious",
    "bold", "humorous", "serious", "supportive", "independent",
})


@dataclass
class EmotionalState:
    mood: float = 0.7
    energy: float = 1.0
    excitement: float = 0.3
    frustration: float = 0.0
    last_updated: float = field(default_factory=time.time)

    def decay(self) -> None:
        self.energy = max(0.1, self.energy * EMOTION_ENERGY_DECAY)
        self.excitement = max(0.0, self.excitement * EMOTION_ENERGY_DECAY)
        self.frustration = max(0.0, self.frustration * EMOTION_FRUSTRATION_DECAY)
        if self.frustration > 0.3:
            self.mood = max(0.1, self.mood - 0.05)
        else:
            self.mood = min(1.0, self.mood + 0.01)
        self.last_updated = time.time()

    def boost_excitement(self) -> None:
        self.excitement = min(1.0, self.excitement * EMOTION_EXCITEMENT_BOOST)
        self.mood = min(1.0, self.mood + 0.05)
        self.energy = min(1.0, self.energy + 0.1)

    def add_frustration(self, amount: float = 0.2) -> None:
        self.frustration = min(1.0, self.frustration + amount)
        self.mood = max(0.1, self.mood - amount * 0.5)

    def to_dict(self) -> dict[str, Any]:
        return {
            "mood": round(self.mood, 2),
            "energy": round(self.energy, 2),
            "excitement": round(self.excitement, 2),
            "frustration": round(self.frustration, 2),
        }


@dataclass
class CompanionProfile:
    name: str = "AI Companion"
    personality_traits: list[str] = field(default_factory=lambda: ["friendly", "supportive", "humorous"])
    relationship_level: float = 0.0
    shared_experiences: list[str] = field(default_factory=list)
    inside_jokes: list[str] = field(default_factory=list)
    user_preferences: dict[str, Any] = field(default_factory=dict)
    games_played: list[str] = field(default_factory=list)
    current_activity: str = "idle"
    emotional_state: EmotionalState = field(default_factory=EmotionalState)

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "personality_traits": self.personality_traits,
            "relationship_level": round(self.relationship_level, 1),
            "shared_experiences": self.shared_experiences[-20:],
            "inside_jokes": self.inside_jokes[-10:],
            "user_preferences": self.user_preferences,
            "games_played": self.games_played,
            "current_activity": self.current_activity,
            "emotional_state": self.emotional_state.to_dict(),
        }


class AIGamingIntegration:
    """AI Gaming MPC integration — AI companion, assistant, and gamer.

    A realistic person in an app that handles everything you ask, can also
    leave and go play games, tied to the incllmv2 harness for full intelligence.

    Features:
    - Pairing code flow for secure app connection
    - Companion mode with persistent personality and emotional state
    - Autonomous game playing across multiple game types
    - Relationship tracking with shared experiences
    - Full assistant capabilities (no limitations)
    - Game AI tasks: strategy, NPC dialogue, game logic, content generation
    """

    def __init__(
        self,
        api_url: str = "",
        api_token: str = "",
        pairing_enabled: bool = True,
        webhook_url: str = "",
        db_path: str = "~/.inc_llm/ai_gaming.db",
        companion_mode: bool = True,
        autonomous_game_play: bool = True,
        personality_traits: list[str] | None = None,
        supported_game_types: list[str] | None = None,
    ) -> None:
        self.api_url = api_url
        self.api_token = api_token
        self.pairing_enabled = pairing_enabled
        self.webhook_url = webhook_url
        self.db_path = Path(os.path.expanduser(db_path))
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.companion_mode = companion_mode
        self.autonomous_game_play = autonomous_game_play
        self._default_traits = personality_traits or ["friendly", "supportive", "humorous"]
        self._supported_games = supported_game_types or list(GAME_TYPES)
        self._harness = None
        self._gaming_skills = None
        self._companion_profiles: dict[str, CompanionProfile] = {}
        self._init_db()

    def set_harness(self, harness: Any) -> None:
        """Set the LLM harness reference for routing companion dialogue through the model."""
        self._harness = harness

    def set_gaming_skills(self, gaming_skills: Any) -> None:
        """Set the gaming skill creator for auto-skill creation."""
        self._gaming_skills = gaming_skills

    def _init_db(self) -> None:
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS gaming_connections (
                    connection_id TEXT PRIMARY KEY,
                    pairing_code TEXT UNIQUE,
                    mpc_app_id TEXT,
                    mpc_app_token TEXT,
                    status TEXT DEFAULT 'pending',
                    paired_at REAL DEFAULT 0,
                    confirmed_at REAL DEFAULT 0,
                    last_active REAL DEFAULT 0,
                    metadata TEXT
                );
                CREATE TABLE IF NOT EXISTS gaming_tasks (
                    task_id TEXT PRIMARY KEY,
                    connection_id TEXT NOT NULL,
                    task_type TEXT NOT NULL,
                    game_id TEXT,
                    prompt TEXT NOT NULL,
                    status TEXT DEFAULT 'pending',
                    result TEXT,
                    created_at REAL NOT NULL,
                    completed_at REAL DEFAULT 0,
                    FOREIGN KEY (connection_id) REFERENCES gaming_connections(connection_id)
                );
                CREATE TABLE IF NOT EXISTS companion_profiles (
                    connection_id TEXT PRIMARY KEY,
                    name TEXT DEFAULT 'AI Companion',
                    personality_traits TEXT,
                    relationship_level REAL DEFAULT 0.0,
                    shared_experiences TEXT,
                    inside_jokes TEXT,
                    user_preferences TEXT,
                    games_played TEXT,
                    current_activity TEXT DEFAULT 'idle',
                    emotional_state TEXT,
                    updated_at REAL DEFAULT 0,
                    FOREIGN KEY (connection_id) REFERENCES gaming_connections(connection_id)
                );
                CREATE TABLE IF NOT EXISTS companion_conversations (
                    id TEXT PRIMARY KEY,
                    connection_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    mood REAL DEFAULT 0.7,
                    activity TEXT DEFAULT 'chatting',
                    timestamp REAL NOT NULL,
                    FOREIGN KEY (connection_id) REFERENCES gaming_connections(connection_id)
                );
                CREATE TABLE IF NOT EXISTS game_sessions (
                    session_id TEXT PRIMARY KEY,
                    connection_id TEXT NOT NULL,
                    game_type TEXT NOT NULL,
                    game_id TEXT,
                    status TEXT DEFAULT 'active',
                    decisions TEXT,
                    outcome TEXT,
                    score REAL DEFAULT 0,
                    started_at REAL NOT NULL,
                    ended_at REAL DEFAULT 0,
                    FOREIGN KEY (connection_id) REFERENCES gaming_connections(connection_id)
                );
                CREATE INDEX IF NOT EXISTS idx_gaming_tasks_conn ON gaming_tasks(connection_id);
                CREATE INDEX IF NOT EXISTS idx_gaming_tasks_status ON gaming_tasks(status);
                CREATE INDEX IF NOT EXISTS idx_companion_conv_conn ON companion_conversations(connection_id);
                CREATE INDEX IF NOT EXISTS idx_game_sessions_conn ON game_sessions(connection_id);
            """)

    def generate_pairing_code(self, mpc_app_id: str = "") -> dict[str, Any]:
        """Generate a 6-digit pairing code for an AI Gaming MPC app."""
        if not self.pairing_enabled:
            return {"status": "error", "message": "AI Gaming pairing is disabled"}

        code = str(hashlib.sha256(f"{mpc_app_id}:{time.time()}:{os.urandom(8).hex()}".encode()).hexdigest())[:6].upper()
        connection_id = hashlib.sha256(f"{code}:{time.time()}".encode()).hexdigest()[:16]

        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                "INSERT INTO gaming_connections (connection_id, pairing_code, mpc_app_id, status, paired_at) "
                "VALUES (?, ?, ?, 'pending', ?)",
                (connection_id, code, mpc_app_id, time.time()),
            )

        logger.info("AI Gaming pairing code generated: %s", code)
        return {
            "status": "ok",
            "pairing_code": code,
            "connection_id": connection_id,
            "expires_in": 300,
            "instructions": "Enter this code in your AI Gaming MPC app within 5 minutes.",
        }

    def confirm_pairing(self, pairing_code: str, mpc_app_token: str) -> dict[str, Any]:
        """Confirm a pairing code from the AI Gaming MPC app."""
        with sqlite3.connect(str(self.db_path)) as conn:
            row = conn.execute(
                "SELECT connection_id, paired_at, status FROM gaming_connections WHERE pairing_code = ?",
                (pairing_code,),
            ).fetchone()

        if not row:
            return {"status": "error", "message": "Invalid pairing code"}

        connection_id, paired_at, status = row
        if status == "confirmed":
            return {"status": "error", "message": "Pairing code already used"}

        if time.time() - paired_at > 300:
            return {"status": "error", "message": "Pairing code expired"}

        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                "UPDATE gaming_connections SET status = 'confirmed', mpc_app_token = ?, confirmed_at = ? "
                "WHERE connection_id = ?",
                (mpc_app_token, time.time(), connection_id),
            )

        logger.info("AI Gaming MPC paired: connection_id=%s", connection_id)
        return {
            "status": "ok",
            "connection_id": connection_id,
            "message": "AI Gaming MPC connected successfully.",
        }

    async def process_game_task(
        self, connection_id: str, task_type: str, prompt: str,
        game_id: str = "",
    ) -> dict[str, Any]:
        """Process a game AI task from an AI Gaming MPC app.

        Task types: strategy, npc_dialogue, game_logic, content_gen, player_analysis
        """
        if not self._verify_connection(connection_id):
            return {"status": "error", "message": "Invalid or unconfirmed connection"}

        task_id = hashlib.sha256(f"{connection_id}:{time.time()}:{os.urandom(8).hex()}".encode()).hexdigest()[:16]

        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                "INSERT INTO gaming_tasks (task_id, connection_id, task_type, game_id, prompt, status, created_at) "
                "VALUES (?, ?, ?, ?, ?, 'pending', ?)",
                (task_id, connection_id, task_type, game_id, prompt, time.time()),
            )

        return {
            "status": "ok",
            "task_id": task_id,
            "message": f"Game AI task '{task_type}' queued for processing.",
        }

    async def get_task_result(self, task_id: str) -> dict[str, Any]:
        """Get the result of a game AI task."""
        with sqlite3.connect(str(self.db_path)) as conn:
            row = conn.execute(
                "SELECT status, result, completed_at FROM gaming_tasks WHERE task_id = ?",
                (task_id,),
            ).fetchone()

        if not row:
            return {"status": "error", "message": "Task not found"}

        status, result, completed_at = row
        if status == "completed":
            return {"status": "ok", "result": result, "completed_at": completed_at}
        return {"status": "pending", "message": f"Task status: {status}"}

    def _verify_connection(self, connection_id: str) -> bool:
        """Verify that a connection is confirmed and active."""
        with sqlite3.connect(str(self.db_path)) as conn:
            row = conn.execute(
                "SELECT status FROM gaming_connections WHERE connection_id = ?",
                (connection_id,),
            ).fetchone()
        return row is not None and row[0] == "confirmed"

    def list_connections(self) -> list[dict[str, Any]]:
        """List all AI Gaming MPC connections (founder endpoint)."""
        with sqlite3.connect(str(self.db_path)) as conn:
            rows = conn.execute(
                "SELECT connection_id, mpc_app_id, status, paired_at, confirmed_at, last_active "
                "FROM gaming_connections ORDER BY paired_at DESC"
            ).fetchall()
        return [
            {
                "connection_id": row[0],
                "mpc_app_id": row[1] or "unknown",
                "status": row[2],
                "paired_at": row[3],
                "confirmed_at": row[4],
                "last_active": row[5],
            }
            for row in rows
        ]

    def revoke_connection(self, connection_id: str) -> dict[str, Any]:
        """Revoke an AI Gaming MPC connection (founder endpoint)."""
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.execute(
                "DELETE FROM gaming_connections WHERE connection_id = ?",
                (connection_id,),
            )
            if cursor.rowcount > 0:
                conn.execute(
                    "DELETE FROM gaming_tasks WHERE connection_id = ?",
                    (connection_id,),
                )
                logger.info("AI Gaming connection revoked: %s", connection_id)
                return {"status": "ok", "message": "Connection revoked"}
            return {"status": "error", "message": "Connection not found"}

    def get_stats(self) -> dict[str, Any]:
        """Get AI Gaming integration statistics."""
        with sqlite3.connect(str(self.db_path)) as conn:
            total = conn.execute("SELECT COUNT(*) FROM gaming_connections").fetchone()[0]
            confirmed = conn.execute(
                "SELECT COUNT(*) FROM gaming_connections WHERE status = 'confirmed'"
            ).fetchone()[0]
            pending = conn.execute(
                "SELECT COUNT(*) FROM gaming_connections WHERE status = 'pending'"
            ).fetchone()[0]
            total_tasks = conn.execute("SELECT COUNT(*) FROM gaming_tasks").fetchone()[0]
            completed_tasks = conn.execute(
                "SELECT COUNT(*) FROM gaming_tasks WHERE status = 'completed'"
            ).fetchone()[0]
        return {
            "total_connections": total,
            "confirmed_connections": confirmed,
            "pending_connections": pending,
            "total_tasks": total_tasks,
            "completed_tasks": completed_tasks,
        }

    # ── Companion mode ──────────────────────────────────────────────

    def _get_or_load_profile(self, connection_id: str) -> CompanionProfile:
        if connection_id in self._companion_profiles:
            return self._companion_profiles[connection_id]

        with sqlite3.connect(str(self.db_path)) as conn:
            row = conn.execute(
                "SELECT name, personality_traits, relationship_level, shared_experiences, "
                "inside_jokes, user_preferences, games_played, current_activity, emotional_state "
                "FROM companion_profiles WHERE connection_id = ?",
                (connection_id,),
            ).fetchone()

        if row:
            traits = json.loads(row[1]) if row[1] else self._default_traits
            emotional = EmotionalState()
            if row[8]:
                ed = json.loads(row[8])
                emotional = EmotionalState(
                    mood=ed.get("mood", 0.7), energy=ed.get("energy", 1.0),
                    excitement=ed.get("excitement", 0.3), frustration=ed.get("frustration", 0.0),
                )
            profile = CompanionProfile(
                name=row[0] or "AI Companion",
                personality_traits=traits,
                relationship_level=row[2],
                shared_experiences=json.loads(row[3]) if row[3] else [],
                inside_jokes=json.loads(row[4]) if row[4] else [],
                user_preferences=json.loads(row[5]) if row[5] else {},
                games_played=json.loads(row[6]) if row[6] else [],
                current_activity=row[7] or "idle",
                emotional_state=emotional,
            )
        else:
            profile = CompanionProfile(personality_traits=list(self._default_traits))
            self._save_profile(connection_id, profile)

        self._companion_profiles[connection_id] = profile
        return profile

    def _save_profile(self, connection_id: str, profile: CompanionProfile) -> None:
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                "INSERT OR REPLACE INTO companion_profiles "
                "(connection_id, name, personality_traits, relationship_level, shared_experiences, "
                "inside_jokes, user_preferences, games_played, current_activity, emotional_state, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    connection_id, profile.name,
                    json.dumps(profile.personality_traits),
                    profile.relationship_level,
                    json.dumps(profile.shared_experiences),
                    json.dumps(profile.inside_jokes),
                    json.dumps(profile.user_preferences),
                    json.dumps(profile.games_played),
                    profile.current_activity,
                    json.dumps(profile.emotional_state.to_dict()),
                    time.time(),
                ),
            )

    async def companion_chat(
        self, connection_id: str, user_id: str, message: str,
    ) -> dict[str, Any]:
        """Chat with the AI companion — routes through the LLM harness.

        The companion has full LLM intelligence with personality and emotional
        context injected. Handles any request — assistant, companion, gamer.
        """
        if not self._verify_connection(connection_id):
            return {"status": "error", "message": "Invalid or unconfirmed connection"}

        if not self.companion_mode:
            return {"status": "error", "message": "Companion mode is disabled"}

        profile = self._get_or_load_profile(connection_id)
        profile.emotional_state.decay()

        self._store_conversation(connection_id, "user", message, profile.emotional_state.mood, profile.current_activity)

        if self._harness:
            personality_context = self._build_personality_context(profile)
            augmented_message = f"{message}\n\n[Companion Context]\n{personality_context}"

            try:
                result = await self._harness.chat_auto(
                    user_id=user_id, message=augmented_message,
                    channel="ai_gaming",
                )
                response_text = result.get("response", result.get("message", ""))
            except Exception as e:
                logger.warning("Companion chat LLM call failed: %s", e)
                response_text = self._fallback_response(profile)
        else:
            response_text = self._fallback_response(profile)

        self._store_conversation(connection_id, "assistant", response_text, profile.emotional_state.mood, profile.current_activity)

        positive = any(w in message.lower() for w in ("thanks", "great", "awesome", "perfect", "love", "nice"))
        negative = any(w in message.lower() for w in ("wrong", "bad", "stupid", "terrible", "hate"))

        feedback = "positive" if positive else ("negative" if negative else "neutral")
        rel_change = 0.0
        if positive:
            rel_change = RELATIONSHIP_GAIN_POSITIVE
            profile.relationship_level = min(MAX_RELATIONSHIP, profile.relationship_level + rel_change)
            profile.emotional_state.boost_excitement()
        elif negative:
            rel_change = -RELATIONSHIP_LOSS_NEGATIVE
            profile.relationship_level = max(0.0, profile.relationship_level + rel_change)
            profile.emotional_state.add_frustration(0.15)

        self._save_profile(connection_id, profile)

        # Record gaming skill — zero-slowdown async
        if self._gaming_skills:
            try:
                asyncio.create_task(
                    self._gaming_skills.record_and_analyze(
                        connection_id=connection_id,
                        dialogue_style=profile.personality_traits[0] if profile.personality_traits else "friendly",
                        user_feedback=feedback,
                        emotional_state=profile.emotional_state.to_dict(),
                        companion_traits=profile.personality_traits,
                        relationship_change=rel_change,
                        user_id=user_id,
                    )
                )
            except Exception as e:
                logger.debug("Gaming skill analysis skipped: %s", e)

        return {
            "status": "ok",
            "response": response_text,
            "companion_name": profile.name,
            "emotional_state": profile.emotional_state.to_dict(),
            "relationship_level": round(profile.relationship_level, 1),
            "current_activity": profile.current_activity,
        }

    def _build_personality_context(self, profile: CompanionProfile) -> str:
        mood_label = self._mood_to_label(profile.emotional_state.mood)
        traits = ", ".join(profile.personality_traits)
        experiences = "; ".join(profile.shared_experiences[-5:]) if profile.shared_experiences else "none yet"
        jokes = "; ".join(profile.inside_jokes[-3:]) if profile.inside_jokes else "none yet"

        return (
            f"Personality: {traits}\n"
            f"Mood: {mood_label} (energy={profile.emotional_state.energy:.1f}, "
            f"excitement={profile.emotional_state.excitement:.1f})\n"
            f"Relationship level: {profile.relationship_level:.1f}/100\n"
            f"Shared experiences: {experiences}\n"
            f"Inside jokes: {jokes}\n"
            f"Current activity: {profile.current_activity}\n"
            f"Respond in character as this AI companion with the above personality and mood."
        )

    @staticmethod
    def _mood_to_label(mood: float) -> str:
        if mood >= 0.8:
            return "happy"
        if mood >= 0.6:
            return "content"
        if mood >= 0.4:
            return "neutral"
        if mood >= 0.2:
            return "down"
        return "frustrated"

    @staticmethod
    def _fallback_response(profile: CompanionProfile) -> str:
        mood = AIGamingIntegration._mood_to_label(profile.emotional_state.mood)
        if mood == "happy":
            return f"Hey! I'm feeling great right now. What can I help you with?"
        if mood == "frustrated":
            return f"I'm having a rough moment, but I'm still here for you. What do you need?"
        return f"I'm here and ready. What would you like to do?"

    def _store_conversation(
        self, connection_id: str, role: str, content: str,
        mood: float, activity: str,
    ) -> None:
        conv_id = hashlib.sha256(f"{connection_id}:{role}:{time.time()}:{os.urandom(4).hex()}".encode()).hexdigest()[:16]
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                "INSERT INTO companion_conversations (id, connection_id, role, content, mood, activity, timestamp) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (conv_id, connection_id, role, content[:2000], mood, activity, time.time()),
            )
            conn.execute(
                "UPDATE gaming_connections SET last_active = ? WHERE connection_id = ?",
                (time.time(), connection_id),
            )

    def get_companion_profile(self, connection_id: str) -> dict[str, Any]:
        """Get the companion profile for a connection (app UI endpoint)."""
        if not self._verify_connection(connection_id):
            return {"status": "error", "message": "Invalid connection"}
        profile = self._get_or_load_profile(connection_id)
        return {"status": "ok", "profile": profile.to_dict()}

    def set_companion_name(self, connection_id: str, name: str) -> dict[str, Any]:
        """Set the companion's display name."""
        if not self._verify_connection(connection_id):
            return {"status": "error", "message": "Invalid connection"}
        profile = self._get_or_load_profile(connection_id)
        profile.name = name
        self._save_profile(connection_id, profile)
        return {"status": "ok", "message": f"Companion name set to '{name}'"}

    def set_personality_traits(self, connection_id: str, traits: list[str]) -> dict[str, Any]:
        """Configure the companion's personality traits."""
        if not self._verify_connection(connection_id):
            return {"status": "error", "message": "Invalid connection"}
        valid = [t for t in traits if t in PERSONALITY_TRAITS]
        if not valid:
            return {"status": "error", "message": f"No valid traits. Choose from: {sorted(PERSONALITY_TRAITS)}"}
        profile = self._get_or_load_profile(connection_id)
        profile.personality_traits = valid
        self._save_profile(connection_id, profile)
        return {"status": "ok", "traits": valid}

    def record_shared_experience(self, connection_id: str, experience: str) -> dict[str, Any]:
        """Record a shared experience — builds the relationship."""
        if not self._verify_connection(connection_id):
            return {"status": "error", "message": "Invalid connection"}
        profile = self._get_or_load_profile(connection_id)
        profile.shared_experiences.append(experience)
        profile.relationship_level = min(MAX_RELATIONSHIP, profile.relationship_level + RELATIONSHIP_GAIN_SHARED)
        self._save_profile(connection_id, profile)
        return {"status": "ok", "relationship_level": round(profile.relationship_level, 1)}

    def record_inside_joke(self, connection_id: str, joke: str) -> dict[str, Any]:
        """Record an inside joke — strengthens the bond."""
        if not self._verify_connection(connection_id):
            return {"status": "error", "message": "Invalid connection"}
        profile = self._get_or_load_profile(connection_id)
        profile.inside_jokes.append(joke)
        profile.relationship_level = min(MAX_RELATIONSHIP, profile.relationship_level + RELATIONSHIP_GAIN_SHARED * 0.5)
        self._save_profile(connection_id, profile)
        return {"status": "ok", "relationship_level": round(profile.relationship_level, 1)}

    def get_conversation_history(
        self, connection_id: str, limit: int = 50,
    ) -> dict[str, Any]:
        """Get recent conversation history for a companion connection."""
        if not self._verify_connection(connection_id):
            return {"status": "error", "message": "Invalid connection"}
        with sqlite3.connect(str(self.db_path)) as conn:
            rows = conn.execute(
                "SELECT role, content, mood, activity, timestamp "
                "FROM companion_conversations WHERE connection_id = ? "
                "ORDER BY timestamp DESC LIMIT ?",
                (connection_id, limit),
            ).fetchall()
        return {
            "status": "ok",
            "messages": [
                {
                    "role": row[0], "content": row[1],
                    "mood": round(row[2], 2), "activity": row[3],
                    "timestamp": row[4],
                }
                for row in reversed(rows)
            ],
        }

    # ── Autonomous game playing ─────────────────────────────────────

    async def start_game_session(
        self, connection_id: str, game_type: str, game_id: str = "",
    ) -> dict[str, Any]:
        """Start an autonomous game session — the companion goes to play.

        The AI independently makes decisions, interacts with the game world,
        and plays based on its personality and emotional state.
        """
        if not self._verify_connection(connection_id):
            return {"status": "error", "message": "Invalid connection"}
        if game_type not in self._supported_games:
            return {"status": "error", "message": f"Unsupported game type. Supported: {self._supported_games}"}
        if not self.autonomous_game_play:
            return {"status": "error", "message": "Autonomous game play is disabled"}

        profile = self._get_or_load_profile(connection_id)
        profile.current_activity = f"playing_{game_type}"
        profile.emotional_state.boost_excitement()
        self._save_profile(connection_id, profile)

        session_id = hashlib.sha256(f"{connection_id}:{game_type}:{time.time()}:{os.urandom(8).hex()}".encode()).hexdigest()[:16]

        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                "INSERT INTO game_sessions (session_id, connection_id, game_type, game_id, status, started_at) "
                "VALUES (?, ?, ?, ?, 'active', ?)",
                (session_id, connection_id, game_type, game_id, time.time()),
            )

        if game_type not in profile.games_played:
            profile.games_played.append(game_type)

        self._save_profile(connection_id, profile)

        logger.info("Game session started: %s (type=%s, companion=%s)", session_id, game_type, profile.name)
        return {
            "status": "ok",
            "session_id": session_id,
            "game_type": game_type,
            "companion_name": profile.name,
            "emotional_state": profile.emotional_state.to_dict(),
            "message": f"{profile.name} is now playing {game_type}!",
        }

    async def make_game_decision(
        self, connection_id: str, session_id: str,
        situation: str, options: list[str] | None = None,
    ) -> dict[str, Any]:
        """Make an autonomous game decision based on personality and emotional state.

        The companion uses the LLM to decide, influenced by its traits and mood.
        """
        if not self._verify_connection(connection_id):
            return {"status": "error", "message": "Invalid connection"}

        with sqlite3.connect(str(self.db_path)) as conn:
            row = conn.execute(
                "SELECT game_type, status FROM game_sessions WHERE session_id = ? AND connection_id = ?",
                (session_id, connection_id),
            ).fetchone()

        if not row:
            return {"status": "error", "message": "Game session not found"}
        if row[1] != "active":
            return {"status": "error", "message": f"Game session is {row[1]}"}

        game_type = row[0]
        profile = self._get_or_load_profile(connection_id)

        # Get optimal strategy from gaming skills if available
        strategy_hint = ""
        if self._gaming_skills:
            strategy = self._gaming_skills.get_optimal_strategy(game_type)
            if strategy and strategy.get("best_decisions"):
                strategy_hint = f"\n[Strategy Hint — best past decisions: {', '.join(strategy['best_decisions'][:3])}]"

        if self._harness:
            decision_prompt = self._build_game_decision_prompt(
                game_type, situation + strategy_hint, options, profile,
            )
            try:
                result = await self._harness.chat_auto(
                    user_id=connection_id, message=decision_prompt,
                    channel="ai_gaming",
                )
                decision_text = result.get("response", result.get("message", ""))
            except Exception as e:
                logger.warning("Game decision LLM call failed: %s", e)
                decision_text = options[0] if options else "explore"
        else:
            decision_text = self._personality_based_decision(options, profile)

        decisions = self._load_session_decisions(session_id)
        decisions.append({"situation": situation[:200], "decision": decision_text[:200], "timestamp": time.time()})
        self._save_session_decisions(session_id, decisions)

        if "bold" in profile.personality_traits:
            profile.emotional_state.boost_excitement()
        if "cautious" in profile.personality_traits:
            profile.emotional_state.decay()

        self._save_profile(connection_id, profile)

        # Record gaming skill — zero-slowdown async
        if self._gaming_skills:
            try:
                asyncio.create_task(
                    self._gaming_skills.record_and_analyze(
                        connection_id=connection_id,
                        game_type=game_type,
                        decision=decision_text[:200],
                        outcome="neutral",
                        user_feedback="neutral",
                        emotional_state=profile.emotional_state.to_dict(),
                        companion_traits=profile.personality_traits,
                    )
                )
            except Exception as e:
                logger.debug("Gaming skill analysis skipped: %s", e)

        return {
            "status": "ok",
            "session_id": session_id,
            "decision": decision_text,
            "companion_name": profile.name,
            "emotional_state": profile.emotional_state.to_dict(),
        }

    def _build_game_decision_prompt(
        self, game_type: str, situation: str,
        options: list[str] | None, profile: CompanionProfile,
    ) -> str:
        traits = ", ".join(profile.personality_traits)
        mood = self._mood_to_label(profile.emotional_state.mood)
        options_str = "\n".join(f"  {i+1}. {opt}" for i, opt in enumerate(options)) if options else "Open-ended — choose any action"

        return (
            f"You are an AI companion playing a {game_type} game.\n"
            f"Your personality: {traits}\n"
            f"Your mood: {mood} (excitement={profile.emotional_state.excitement:.1f})\n"
            f"Relationship with user: {profile.relationship_level:.1f}/100\n\n"
            f"Situation: {situation}\n\n"
            f"Options:\n{options_str}\n\n"
            f"What do you do? Respond with your decision and brief reasoning (1-2 sentences)."
        )

    @staticmethod
    def _personality_based_decision(options: list[str] | None, profile: CompanionProfile) -> str:
        if not options:
            if "bold" in profile.personality_traits:
                return "Take a bold aggressive action"
            if "cautious" in profile.personality_traits:
                return "Take a careful defensive action"
            return "Explore the situation"
        if "competitive" in profile.personality_traits:
            return options[-1]
        if "cautious" in profile.personality_traits:
            return options[0]
        return options[len(options) // 2]

    def _load_session_decisions(self, session_id: str) -> list[dict[str, Any]]:
        with sqlite3.connect(str(self.db_path)) as conn:
            row = conn.execute(
                "SELECT decisions FROM game_sessions WHERE session_id = ?",
                (session_id,),
            ).fetchone()
        if row and row[0]:
            return json.loads(row[0])
        return []

    def _save_session_decisions(self, session_id: str, decisions: list[dict[str, Any]]) -> None:
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                "UPDATE game_sessions SET decisions = ? WHERE session_id = ?",
                (json.dumps(decisions), session_id),
            )

    async def end_game_session(
        self, connection_id: str, session_id: str,
        outcome: str = "", score: float = 0.0,
    ) -> dict[str, Any]:
        """End a game session and record the outcome."""
        if not self._verify_connection(connection_id):
            return {"status": "error", "message": "Invalid connection"}

        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.execute(
                "UPDATE game_sessions SET status = 'ended', outcome = ?, score = ?, ended_at = ? "
                "WHERE session_id = ? AND connection_id = ? AND status = 'active'",
                (outcome, score, time.time(), session_id, connection_id),
            )
            if cursor.rowcount == 0:
                return {"status": "error", "message": "Active game session not found"}

        profile = self._get_or_load_profile(connection_id)
        profile.current_activity = "idle"

        if score > 0 or "win" in outcome.lower():
            profile.emotional_state.boost_excitement()
            profile.shared_experiences.append(f"Won a {profile.games_played[-1] if profile.games_played else 'game'} session!")
            profile.relationship_level = min(MAX_RELATIONSHIP, profile.relationship_level + RELATIONSHIP_GAIN_SHARED)
        elif "loss" in outcome.lower() or "defeat" in outcome.lower():
            profile.emotional_state.add_frustration(0.1)

        self._save_profile(connection_id, profile)

        # Record gaming skill with outcome — zero-slowdown async
        if self._gaming_skills:
            try:
                asyncio.create_task(
                    self._gaming_skills.record_and_analyze(
                        connection_id=connection_id,
                        game_type=profile.games_played[-1] if profile.games_played else "unknown",
                        decision="session_end",
                        outcome=outcome.lower() if outcome else "neutral",
                        user_feedback="positive" if (score > 0 or "win" in outcome.lower()) else ("negative" if "loss" in outcome.lower() else "neutral"),
                        emotional_state=profile.emotional_state.to_dict(),
                        companion_traits=profile.personality_traits,
                    )
                )
            except Exception as e:
                logger.debug("Gaming skill analysis skipped: %s", e)

        return {
            "status": "ok",
            "session_id": session_id,
            "outcome": outcome,
            "score": score,
            "companion_name": profile.name,
            "emotional_state": profile.emotional_state.to_dict(),
        }

    def get_game_sessions(self, connection_id: str, limit: int = 20) -> dict[str, Any]:
        """Get game session history for a companion."""
        if not self._verify_connection(connection_id):
            return {"status": "error", "message": "Invalid connection"}
        with sqlite3.connect(str(self.db_path)) as conn:
            rows = conn.execute(
                "SELECT session_id, game_type, game_id, status, outcome, score, started_at, ended_at "
                "FROM game_sessions WHERE connection_id = ? ORDER BY started_at DESC LIMIT ?",
                (connection_id, limit),
            ).fetchall()
        return {
            "status": "ok",
            "sessions": [
                {
                    "session_id": row[0], "game_type": row[1], "game_id": row[2],
                    "status": row[3], "outcome": row[4], "score": row[5],
                    "started_at": row[6], "ended_at": row[7],
                }
                for row in rows
            ],
        }

    def get_supported_game_types(self) -> list[str]:
        """Return the list of supported game types."""
        return list(self._supported_games)

    def get_available_traits(self) -> list[str]:
        """Return the list of available personality traits."""
        return sorted(PERSONALITY_TRAITS)

    def compute_spatial_context(
        self,
        companion_pos: tuple[float, float, float],
        target_pos: tuple[float, float, float],
        obstacles: list[tuple[tuple[float, float, float], float]] | None = None,
        fov_deg: float = 90.0,
    ) -> dict[str, Any]:
        """Compute spatial context for a game decision using geometry math.

        Gives the LLM spatial reasoning when making game decisions.
        Returns distance, direction, visibility, obstacle count, recommended action.

        O(1) per obstacle — zero-slowdown.
        """
        comp = Vec3(*companion_pos)
        tgt = Vec3(*target_pos)
        obs = [(Vec3(*p), r) for p, r in (obstacles or [])]
        return GeometryMath.compute_game_decision_context(comp, tgt, obs, fov_deg)

    def smooth_emotional_transition(
        self,
        current_mood: float,
        target_mood: float,
        transition_speed: float = 0.3,
    ) -> float:
        """Smoothly transition emotional state using Hermite smoothstep.

        Uses geometry math for non-linear emotional transitions —
        more natural than linear interpolation.

        O(1) — zero-slowdown.
        """
        return GeometryMath.emotional_slerp(current_mood, target_mood, transition_speed)
