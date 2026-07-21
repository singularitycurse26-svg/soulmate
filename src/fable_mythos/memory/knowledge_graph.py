"""Knowledge graph — recursive memory linking across all 3 layers.

SQLite-backed graph with nodes (facts, episodes, skills, decisions, traces, files, concepts)
and bidirectional edges (created_by, references, evokes, depends_on, contradicts,
supersedes, retrieved_for, verified_by, used_skill, created_skill, applies_skill).

Supports auto-linking, recursive retrieval (configurable depth), link decay,
and graph queries (get_links, traverse, find_path, get_connected).
"""

from __future__ import annotations

import logging
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Node types
NODE_TYPES = ("fact", "episode", "skill", "decision", "trace", "file", "concept")

# Edge types
EDGE_TYPES = (
    "created_by",
    "references",
    "evokes",
    "depends_on",
    "contradicts",
    "supersedes",
    "retrieved_for",
    "verified_by",
    "used_skill",
    "created_skill",
    "applies_skill",
)


@dataclass
class GraphNode:
    """A node in the memory knowledge graph."""

    id: str
    node_type: str
    content: str  # short description or summary
    metadata: dict[str, Any] | None = None
    created_at: float = 0.0


@dataclass
class GraphEdge:
    """A bidirectional edge in the memory knowledge graph."""

    source_id: str
    target_id: str
    edge_type: str
    weight: float = 1.0
    created_at: float = 0.0
    last_reinforced: float = 0.0


class KnowledgeGraph:
    """SQLite-backed knowledge graph for recursive memory linking.

    All edges are bidirectional — when an edge (A → B, type) is added,
    the reverse edge (B → A, type) is also added automatically.
    """

    def __init__(self, db_path: str | Path, decay_halflife_days: int = 30) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.decay_halflife_days = decay_halflife_days
        self._init_db()

    def _init_db(self) -> None:
        """Initialize the SQLite database schema."""
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
                    PRIMARY KEY (source_id, target_id, edge_type),
                    FOREIGN KEY (source_id) REFERENCES nodes(id),
                    FOREIGN KEY (target_id) REFERENCES nodes(id)
                );

                CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
                CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
                CREATE INDEX IF NOT EXISTS idx_edges_type ON edges(edge_type);
                CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(node_type);
            """)

    def add_node(
        self,
        node_id: str,
        node_type: str,
        content: str,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Add a node to the graph.

        Args:
            node_id: Unique identifier for the node.
            node_type: One of NODE_TYPES (fact, episode, skill, etc.)
            content: Short description or summary of the node.
            metadata: Optional metadata dict (stored as JSON).
        """
        if node_type not in NODE_TYPES:
            raise ValueError(f"Invalid node type: {node_type}. Valid: {NODE_TYPES}")

        import json

        now = time.time()
        meta_json = json.dumps(metadata) if metadata else None

        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                "INSERT OR REPLACE INTO nodes (id, node_type, content, metadata, created_at) VALUES (?, ?, ?, ?, ?)",
                (node_id, node_type, content, meta_json, now),
            )
        logger.debug("Added node %s (%s): %s", node_id, node_type, content[:80])

    def add_edge(
        self,
        source_id: str,
        target_id: str,
        edge_type: str,
        weight: float = 1.0,
    ) -> None:
        """Add a bidirectional edge between two nodes.

        Both nodes must already exist. The reverse edge is added automatically.

        Args:
            source_id: Source node ID.
            target_id: Target node ID.
            edge_type: One of EDGE_TYPES.
            weight: Edge weight (0.0 to 1.0).
        """
        if edge_type not in EDGE_TYPES:
            raise ValueError(f"Invalid edge type: {edge_type}. Valid: {EDGE_TYPES}")

        now = time.time()

        with sqlite3.connect(str(self.db_path)) as conn:
            # Check both nodes exist
            cursor = conn.execute(
                "SELECT 1 FROM nodes WHERE id = ? UNION SELECT 1 FROM nodes WHERE id = ?",
                (source_id, target_id),
            )
            if cursor.fetchone() is None or len(cursor.fetchall()) < 1:
                # Re-check properly
                cursor2 = conn.execute(
                    "SELECT COUNT(*) FROM nodes WHERE id IN (?, ?)",
                    (source_id, target_id),
                )
                count = cursor2.fetchone()[0]
                if count < 2:
                    raise ValueError(
                        f"Both nodes must exist before adding edge. "
                        f"Found {count}/2 nodes (source={source_id}, target={target_id})"
                    )

            # Add forward edge
            conn.execute(
                """INSERT OR REPLACE INTO edges (source_id, target_id, edge_type, weight, created_at, last_reinforced)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (source_id, target_id, edge_type, weight, now, now),
            )

            # Add reverse edge (bidirectional)
            conn.execute(
                """INSERT OR REPLACE INTO edges (source_id, target_id, edge_type, weight, created_at, last_reinforced)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (target_id, source_id, edge_type, weight, now, now),
            )

        logger.debug("Added edge %s → %s (%s, w=%.2f)", source_id, target_id, edge_type, weight)

    def get_links(self, node_id: str) -> list[GraphEdge]:
        """Get all edges connected to a node.

        Args:
            node_id: The node to get links for.

        Returns:
            List of GraphEdge objects connected to this node.
        """
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.execute(
                "SELECT source_id, target_id, edge_type, weight, created_at, last_reinforced "
                "FROM edges WHERE source_id = ? OR target_id = ?",
                (node_id, node_id),
            )
            return [
                GraphEdge(
                    source_id=row[0],
                    target_id=row[1],
                    edge_type=row[2],
                    weight=row[3],
                    created_at=row[4],
                    last_reinforced=row[5],
                )
                for row in cursor.fetchall()
            ]

    def get_connected(
        self,
        node_type: str | None = None,
        edge_type: str | None = None,
    ) -> list[tuple[GraphNode, GraphNode, GraphEdge]]:
        """Get all edges matching the given filters.

        Args:
            node_type: Filter by node type (both source and target).
            edge_type: Filter by edge type.

        Returns:
            List of (source_node, target_node, edge) tuples.
        """
        query = """
            SELECT n1.id, n1.node_type, n1.content, n1.metadata, n1.created_at,
                   n2.id, n2.node_type, n2.content, n2.metadata, n2.created_at,
                   e.source_id, e.target_id, e.edge_type, e.weight, e.created_at, e.last_reinforced
            FROM edges e
            JOIN nodes n1 ON e.source_id = n1.id
            JOIN nodes n2 ON e.target_id = n2.id
            WHERE 1=1
        """
        params: list[Any] = []

        if edge_type:
            query += " AND e.edge_type = ?"
            params.append(edge_type)

        if node_type:
            query += " AND n1.node_type = ? AND n2.node_type = ?"
            params.extend([node_type, node_type])

        import json

        results: list[tuple[GraphNode, GraphNode, GraphEdge]] = []
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.execute(query, params)
            for row in cursor.fetchall():
                src = GraphNode(
                    id=row[0], node_type=row[1], content=row[2],
                    metadata=json.loads(row[3]) if row[3] else None,
                    created_at=row[4],
                )
                tgt = GraphNode(
                    id=row[5], node_type=row[6], content=row[7],
                    metadata=json.loads(row[8]) if row[8] else None,
                    created_at=row[9],
                )
                edge = GraphEdge(
                    source_id=row[10], target_id=row[11], edge_type=row[12],
                    weight=row[13], created_at=row[14], last_reinforced=row[15],
                )
                results.append((src, tgt, edge))

        return results

    def traverse(
        self,
        start_id: str,
        max_depth: int = 2,
        edge_type: str | None = None,
    ) -> dict[str, list[GraphEdge]]:
        """Traverse the graph from a starting node up to max_depth hops.

        Args:
            start_id: The node to start traversal from.
            max_depth: Maximum number of hops (default: 2).
            edge_type: Optional filter to only follow specific edge types.

        Returns:
            Dict mapping node_id → list of edges connecting it to the traversal path.
        """
        visited: set[str] = set()
        result: dict[str, list[GraphEdge]] = {}
        current_level = {start_id}
        visited.add(start_id)

        for depth in range(max_depth):
            next_level: set[str] = set()

            for node_id in current_level:
                links = self.get_links(node_id)
                for edge in links:
                    neighbor = edge.target_id if edge.source_id == node_id else edge.source_id
                    if neighbor in visited:
                        continue
                    if edge_type and edge.edge_type != edge_type:
                        continue

                    # Apply decay to weight
                    decayed_weight = self._apply_decay(edge)
                    edge.weight = decayed_weight

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
        """Find a path between two nodes using BFS.

        Args:
            start_id: Starting node ID.
            end_id: Target node ID.
            max_depth: Maximum search depth.

        Returns:
            List of node IDs forming the path, or None if no path found.
        """
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
            links = self.get_links(current)

            for edge in links:
                neighbor = edge.target_id if edge.source_id == current else edge.source_id
                if neighbor == end_id:
                    return path + [neighbor]
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(path + [neighbor])

        return None

    def reinforce_edge(self, source_id: str, target_id: str, edge_type: str) -> None:
        """Reinforce an edge by updating its last_reinforced timestamp and weight.

        Args:
            source_id: Source node ID.
            target_id: Target node ID.
            edge_type: Edge type to reinforce.
        """
        now = time.time()
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                "UPDATE edges SET last_reinforced = ?, weight = MIN(1.0, weight + 0.1) "
                "WHERE (source_id = ? AND target_id = ? AND edge_type = ?) "
                "OR (source_id = ? AND target_id = ? AND edge_type = ?)",
                (now, source_id, target_id, edge_type, target_id, source_id, edge_type),
            )

    def auto_link_skill_created(self, episode_id: str, skill_id: str) -> None:
        """Auto-link when an episode creates a skill."""
        self.add_edge(episode_id, skill_id, "created_skill", weight=1.0)

    def auto_link_skill_used(self, episode_id: str, skill_id: str) -> None:
        """Auto-link when an episode uses a skill."""
        self.add_edge(episode_id, skill_id, "used_skill", weight=0.8)

    def auto_link_skill_verified(self, skill_id: str, episode_id: str) -> None:
        """Auto-link when an episode verifies a skill."""
        self.add_edge(skill_id, episode_id, "verified_by", weight=0.9)

    def auto_link_contradicts(self, node_a: str, node_b: str) -> None:
        """Auto-link when two nodes contradict each other."""
        self.add_edge(node_a, node_b, "contradicts", weight=0.7)

    def auto_link_supersedes(self, new_id: str, old_id: str) -> None:
        """Auto-link when a new node supersedes an old one."""
        self.add_edge(new_id, old_id, "supersedes", weight=0.9)

    def auto_link_depends_on(self, skill_id: str, dependency_id: str) -> None:
        """Auto-link when a skill depends on another skill."""
        self.add_edge(skill_id, dependency_id, "depends_on", weight=0.8)

    def _apply_decay(self, edge: GraphEdge) -> float:
        """Apply time-based decay to an edge weight.

        Uses exponential decay with configurable half-life.
        Weight is halved every `decay_halflife_days` days unless reinforced.
        """
        now = time.time()
        elapsed_s = now - edge.last_reinforced
        elapsed_days = elapsed_s / 86400.0

        if elapsed_days <= 0:
            return edge.weight

        # Exponential decay: w(t) = w0 * 0.5^(t / halflife)
        decay_factor = 0.5 ** (elapsed_days / self.decay_halflife_days)
        return edge.weight * decay_factor

    def get_node(self, node_id: str) -> GraphNode | None:
        """Get a single node by ID."""
        import json

        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.execute(
                "SELECT id, node_type, content, metadata, created_at FROM nodes WHERE id = ?",
                (node_id,),
            )
            row = cursor.fetchone()
            if row is None:
                return None
            return GraphNode(
                id=row[0], node_type=row[1], content=row[2],
                metadata=json.loads(row[3]) if row[3] else None,
                created_at=row[4],
            )

    def get_nodes_by_type(self, node_type: str) -> list[GraphNode]:
        """Get all nodes of a given type."""
        import json

        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.execute(
                "SELECT id, node_type, content, metadata, created_at FROM nodes WHERE node_type = ?",
                (node_type,),
            )
            return [
                GraphNode(
                    id=row[0], node_type=row[1], content=row[2],
                    metadata=json.loads(row[3]) if row[3] else None,
                    created_at=row[4],
                )
                for row in cursor.fetchall()
            ]

    def count_nodes(self) -> int:
        """Count total nodes in the graph."""
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.execute("SELECT COUNT(*) FROM nodes")
            return cursor.fetchone()[0]

    def count_edges(self) -> int:
        """Count total edges in the graph."""
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.execute("SELECT COUNT(*) FROM edges")
            return cursor.fetchone()[0]
