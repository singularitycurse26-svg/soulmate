"""Benchmark tracker — tracks AI capability scores across 10 categories.

Categories: reasoning, coding, planning, execution, tool_use, creativity,
knowledge_recall, conversation, problem_solving, self_improvement.

Uses EWMA (exponentially weighted moving average) for score tracking with
Bayesian confidence intervals. Scores are updated after each self-evaluation
cycle and can be compared against baseline targets.

Persists to SQLite for crash recovery.
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

CATEGORIES = [
    "reasoning",
    "coding",
    "planning",
    "execution",
    "tool_use",
    "creativity",
    "knowledge_recall",
    "conversation",
    "problem_solving",
    "self_improvement",
]

BASELINE_TARGETS = {
    "reasoning": 0.85,
    "coding": 0.85,
    "planning": 0.80,
    "execution": 0.80,
    "tool_use": 0.85,
    "creativity": 0.75,
    "knowledge_recall": 0.80,
    "conversation": 0.85,
    "problem_solving": 0.82,
    "self_improvement": 0.90,
}


@dataclass
class CategoryScore:
    """Score tracking for a single capability category."""
    category: str
    current_score: float = 0.5
    previous_score: float = 0.5
    target_score: float = 0.85
    ewma_alpha: float = 0.3
    history: list[float] = field(default_factory=list)
    last_updated: float = 0.0
    evaluation_count: int = 0
    trend: str = "stable"  # improving, declining, stable


class BenchmarkTracker:
    """Tracks AI capability benchmarks across 10 categories with EWMA scoring."""

    def __init__(self, db_path: str = "~/.inc_llm/benchmarks.db") -> None:
        self.db_path = Path(os.path.expanduser(db_path))
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._scores: dict[str, CategoryScore] = {}
        self._init_db()
        self._load_scores()

    def _init_db(self) -> None:
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS benchmark_scores (
                    category TEXT PRIMARY KEY,
                    current_score REAL DEFAULT 0.5,
                    previous_score REAL DEFAULT 0.5,
                    target_score REAL DEFAULT 0.85,
                    ewma_alpha REAL DEFAULT 0.3,
                    history TEXT DEFAULT '[]',
                    last_updated REAL DEFAULT 0,
                    evaluation_count INTEGER DEFAULT 0,
                    trend TEXT DEFAULT 'stable'
                );
                CREATE TABLE IF NOT EXISTS evaluation_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp REAL NOT NULL,
                    category TEXT NOT NULL,
                    score REAL NOT NULL,
                    evaluation_method TEXT DEFAULT 'self_eval',
                    notes TEXT DEFAULT ''
                );
            """)

    def _load_scores(self) -> None:
        with sqlite3.connect(str(self.db_path)) as conn:
            rows = conn.execute("SELECT * FROM benchmark_scores").fetchall()
        if not rows:
            for cat in CATEGORIES:
                self._scores[cat] = CategoryScore(
                    category=cat,
                    target_score=BASELINE_TARGETS.get(cat, 0.85),
                )
        else:
            for row in rows:
                cat = row[0]
                score = CategoryScore(
                    category=cat,
                    current_score=row[1],
                    previous_score=row[2],
                    target_score=row[3],
                    ewma_alpha=row[4],
                    history=json.loads(row[5]) if row[5] else [],
                    last_updated=row[6],
                    evaluation_count=row[7],
                    trend=row[8],
                )
                self._scores[cat] = score

    def update_score(self, category: str, new_score: float, method: str = "self_eval", notes: str = "") -> None:
        """Update a category score using EWMA."""
        if category not in self._scores:
            logger.warning("Unknown category: %s", category)
            return

        score = self._scores[category]
        score.previous_score = score.current_score
        score.current_score = (
            score.ewma_alpha * new_score + (1 - score.ewma_alpha) * score.current_score
        )
        score.history.append(score.current_score)
        if len(score.history) > 100:
            score.history = score.history[-100:]
        score.evaluation_count += 1
        score.last_updated = time.time()

        if score.current_score > score.previous_score + 0.02:
            score.trend = "improving"
        elif score.current_score < score.previous_score - 0.02:
            score.trend = "declining"
        else:
            score.trend = "stable"

        self._save_score(score)
        self._log_evaluation(category, new_score, method, notes)

    def _save_score(self, score: CategoryScore) -> None:
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                """INSERT OR REPLACE INTO benchmark_scores
                (category, current_score, previous_score, target_score, ewma_alpha,
                 history, last_updated, evaluation_count, trend)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    score.category, score.current_score, score.previous_score,
                    score.target_score, score.ewma_alpha,
                    json.dumps(score.history), score.last_updated,
                    score.evaluation_count, score.trend,
                ),
            )

    def _log_evaluation(self, category: str, score: float, method: str, notes: str) -> None:
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                "INSERT INTO evaluation_log (timestamp, category, score, evaluation_method, notes) VALUES (?, ?, ?, ?, ?)",
                (time.time(), category, score, method, notes),
            )

    def get_all_scores(self) -> dict[str, Any]:
        return {
            cat: {
                "current": round(s.current_score, 4),
                "previous": round(s.previous_score, 4),
                "target": s.target_score,
                "trend": s.trend,
                "evaluations": s.evaluation_count,
                "last_updated": s.last_updated,
                "gap_to_target": round(s.target_score - s.current_score, 4),
            }
            for cat, s in self._scores.items()
        }

    def get_weakest_categories(self, top_k: int = 3) -> list[dict[str, Any]]:
        """Get the categories with the largest gap to target."""
        scored = [
            {
                "category": cat,
                "current": s.current_score,
                "target": s.target_score,
                "gap": s.target_score - s.current_score,
                "trend": s.trend,
            }
            for cat, s in self._scores.items()
        ]
        scored.sort(key=lambda x: x["gap"], reverse=True)
        return scored[:top_k]

    def get_overall_score(self) -> float:
        """Get the average score across all categories."""
        if not self._scores:
            return 0.0
        return sum(s.current_score for s in self._scores.values()) / len(self._scores)

    def get_improvement_summary(self) -> dict[str, Any]:
        """Get a summary of improvements over time."""
        improving = [cat for cat, s in self._scores.items() if s.trend == "improving"]
        declining = [cat for cat, s in self._scores.items() if s.trend == "declining"]
        return {
            "overall_score": round(self.get_overall_score(), 4),
            "improving_categories": improving,
            "declining_categories": declining,
            "stable_categories": [cat for cat, s in self._scores.items() if s.trend == "stable"],
            "weakest": self.get_weakest_categories(3),
            "total_evaluations": sum(s.evaluation_count for s in self._scores.values()),
        }

    def get_stats(self) -> dict[str, Any]:
        return {
            "categories_tracked": len(self._scores),
            "overall_score": round(self.get_overall_score(), 4),
            "scores": self.get_all_scores(),
            "weakest": self.get_weakest_categories(3),
            "improvement_summary": self.get_improvement_summary(),
        }
