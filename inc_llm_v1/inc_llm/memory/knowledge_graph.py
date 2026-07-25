"""Knowledge graph — recursive memory linking across all 3 layers + universal peers.

SQLite-backed graph with nodes (facts, episodes, skills, decisions, traces, files,
concepts, peers) and bidirectional edges. Supports auto-linking, recursive retrieval,
link decay, and universal peer linking for cross-instance learning.
"""

from __future__ import annotations

import json
import logging
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

NODE_TYPES = ("fact", "episode", "skill", "decision", "trace", "file", "concept", "peer", "learning")

EDGE_TYPES = (
    "created_by", "references", "evokes", "depends_on", "contradicts",
    "supersedes", "retrieved_for", "verified_by", "used_skill",
    "created_skill", "applies_skill", "learned_from_peer",
    "shared_with_peer", "improved_by_peer", "universal_link",
)


@dataclass
class GraphNode:
    id: str
    node_type: str
    content: str
    metadata: dict[str, Any] | None = None
    created_at: float = 0.0


@dataclass
class GraphEdge:
    source_id: str
    target_id: str
    edge_type: str
    weight: float = 1.0
    created_at: float = 0.0
    last_reinforced: float = 0.0


class KnowledgeGraph:
    """SQLite-backed knowledge graph for recursive memory linking."""

    def __init__(self, db_path: str | Path, decay_halflife_days: int = 60) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.decay_halflife_days = decay_halflife_days
        self._init_db()

    def _init_db(self) -> None:
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS nodes (
                    id TEXT PRIMARY KEY,
                    node_type TEXT NOT NULL,
                    content TEXT NOT NULL,
                    metadata TEXT,
                    created_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS edges (
                    source_id TEXT NOT NULL,
                    target_id TEXT NOT NULL,
                    edge_type TEXT NOT NULL,
                    weight REAL DEFAULT 1.0,
                    created_at REAL NOT NULL,
                    last_reinforced REAL NOT NULL,
                    PRIMARY KEY (source_id, target_id, edge_type)
                );
                CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
                CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
                CREATE INDEX IF NOT EXISTS idx_edges_type ON edges(edge_type);
                CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(node_type);
            """)

    def add_node(self, node_id: str, node_type: str, content: str, metadata: dict[str, Any] | None = None) -> None:
        if node_type not in NODE_TYPES:
            raise ValueError(f"Invalid node type: {node_type}. Valid: {NODE_TYPES}")
        now = time.time()
        meta_json = json.dumps(metadata) if metadata else None
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                "INSERT OR REPLACE INTO nodes (id, node_type, content, metadata, created_at) VALUES (?, ?, ?, ?, ?)",
                (node_id, node_type, content, meta_json, now),
            )

    def add_edge(self, source_id: str, target_id: str, edge_type: str, weight: float = 1.0) -> None:
        if edge_type not in EDGE_TYPES:
            raise ValueError(f"Invalid edge type: {edge_type}. Valid: {EDGE_TYPES}")
        now = time.time()
        with sqlite3.connect(str(self.db_path)) as conn:
            count = conn.execute("SELECT COUNT(*) FROM nodes WHERE id IN (?, ?)", (source_id, target_id)).fetchone()[0]
            if count < 2:
                raise ValueError(f"Both nodes must exist. Found {count}/2 (source={source_id}, target={target_id})")
            conn.execute(
                "INSERT OR REPLACE INTO edges (source_id, target_id, edge_type, weight, created_at, last_reinforced) VALUES (?, ?, ?, ?, ?, ?)",
                (source_id, target_id, edge_type, weight, now, now),
            )
            conn.execute(
                "INSERT OR REPLACE INTO edges (source_id, target_id, edge_type, weight, created_at, last_reinforced) VALUES (?, ?, ?, ?, ?, ?)",
                (target_id, source_id, edge_type, weight, now, now),
            )

    def get_links(self, node_id: str) -> list[GraphEdge]:
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.execute(
                "SELECT source_id, target_id, edge_type, weight, created_at, last_reinforced FROM edges WHERE source_id = ? OR target_id = ?",
                (node_id, node_id),
            )
            return [GraphEdge(r[0], r[1], r[2], r[3], r[4], r[5]) for r in cursor.fetchall()]

    def traverse(self, start_id: str, max_depth: int = 3, edge_type: str | None = None) -> dict[str, list[GraphEdge]]:
        visited: set[str] = {start_id}
        result: dict[str, list[GraphEdge]] = {}
        current_level = {start_id}
        for _ in range(max_depth):
            next_level: set[str] = set()
            for node_id in current_level:
                for edge in self.get_links(node_id):
                    neighbor = edge.target_id if edge.source_id == node_id else edge.source_id
                    if neighbor in visited:
                        continue
                    if edge_type and edge.edge_type != edge_type:
                        continue
                    edge.weight = self._apply_decay(edge)
                    if neighbor not in result:
                        result[neighbor] = []
                    result[neighbor].append(edge)
                    next_level.add(neighbor)
                    visited.add(neighbor)
            current_level = next_level
            if not current_level:
                break
        return result

    def find_path(self, start_id: str, end_id: str, max_depth: int = 5) -> list[str] | None:
        if start_id == end_id:
            return [start_id]
        from collections import deque
        queue: deque[list[str]] = deque([[start_id]])
        visited: set[str] = {start_id}
        while queue:
            path = queue.popleft()
            if len(path) > max_depth:
                continue
            current = path[-1]
            for edge in self.get_links(current):
                neighbor = edge.target_id if edge.source_id == current else edge.source_id
                if neighbor == end_id:
                    return path + [neighbor]
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(path + [neighbor])
        return None

    def reinforce_edge(self, source_id: str, target_id: str, edge_type: str) -> None:
        now = time.time()
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                "UPDATE edges SET last_reinforced = ?, weight = MIN(1.0, weight + 0.1) "
                "WHERE (source_id = ? AND target_id = ? AND edge_type = ?) "
                "OR (source_id = ? AND target_id = ? AND edge_type = ?)",
                (now, source_id, target_id, edge_type, target_id, source_id, edge_type),
            )

    def auto_link_skill_created(self, episode_id: str, skill_id: str) -> None:
        self.add_edge(episode_id, skill_id, "created_skill", weight=1.0)

    def auto_link_skill_used(self, episode_id: str, skill_id: str) -> None:
        self.add_edge(episode_id, skill_id, "used_skill", weight=0.8)

    def auto_link_skill_verified(self, skill_id: str, episode_id: str) -> None:
        self.add_edge(skill_id, episode_id, "verified_by", weight=0.9)

    def auto_link_learned_from_peer(self, local_node_id: str, peer_node_id: str) -> None:
        self.add_edge(local_node_id, peer_node_id, "learned_from_peer", weight=0.9)

    def auto_link_shared_with_peer(self, local_node_id: str, peer_node_id: str) -> None:
        self.add_edge(local_node_id, peer_node_id, "shared_with_peer", weight=0.8)

    def auto_link_improved_by_peer(self, local_node_id: str, peer_node_id: str) -> None:
        self.add_edge(local_node_id, peer_node_id, "improved_by_peer", weight=1.0)

    def auto_link_universal(self, node_a: str, node_b: str) -> None:
        self.add_edge(node_a, node_b, "universal_link", weight=1.0)

    def _apply_decay(self, edge: GraphEdge) -> float:
        now = time.time()
        elapsed_days = (now - edge.last_reinforced) / 86400.0
        if elapsed_days <= 0:
            return edge.weight
        return edge.weight * (0.5 ** (elapsed_days / self.decay_halflife_days))

    def get_node(self, node_id: str) -> GraphNode | None:
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.execute("SELECT id, node_type, content, metadata, created_at FROM nodes WHERE id = ?", (node_id,))
            row = cursor.fetchone()
        if row is None:
            return None
        return GraphNode(row[0], row[1], row[2], json.loads(row[3]) if row[3] else None, row[4])

    def get_nodes_by_type(self, node_type: str) -> list[GraphNode]:
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.execute("SELECT id, node_type, content, metadata, created_at FROM nodes WHERE node_type = ?", (node_type,))
            return [GraphNode(r[0], r[1], r[2], json.loads(r[3]) if r[3] else None, r[4]) for r in cursor.fetchall()]

    def count_nodes(self) -> int:
        with sqlite3.connect(str(self.db_path)) as conn:
            return conn.execute("SELECT COUNT(*) FROM nodes").fetchone()[0]

    def count_edges(self) -> int:
        with sqlite3.connect(str(self.db_path)) as conn:
            return conn.execute("SELECT COUNT(*) FROM edges").fetchone()[0]

    def get_peer_nodes(self) -> list[GraphNode]:
        return self.get_nodes_by_type("peer")

    def get_learning_nodes(self) -> list[GraphNode]:
        return self.get_nodes_by_type("learning")
