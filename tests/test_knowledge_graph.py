"""Tests for the knowledge graph — recursive memory linking."""

from __future__ import annotations

import pytest

from fable_mythos.memory.knowledge_graph import KnowledgeGraph, GraphNode, GraphEdge


@pytest.fixture
def graph(tmp_path):
    return KnowledgeGraph(db_path=tmp_path / "test_graph.db", decay_halflife_days=30)


class TestKnowledgeGraph:
    def test_add_node(self, graph):
        graph.add_node("ep:1", "episode", "First episode")
        node = graph.get_node("ep:1")
        assert node is not None
        assert node.node_type == "episode"
        assert node.content == "First episode"

    def test_add_node_invalid_type(self, graph):
        with pytest.raises(ValueError):
            graph.add_node("n1", "invalid_type", "test")

    def test_add_node_with_metadata(self, graph):
        graph.add_node("s:1", "skill", "deploy", metadata={"category": "devops"})
        node = graph.get_node("s:1")
        assert node is not None
        assert node.metadata == {"category": "devops"}

    def test_get_node_not_found(self, graph):
        assert graph.get_node("nonexistent") is None

    def test_add_edge(self, graph):
        graph.add_node("ep:1", "episode", "ep1")
        graph.add_node("s:1", "skill", "skill1")
        graph.add_edge("ep:1", "s:1", "created_skill")

        links = graph.get_links("ep:1")
        assert len(links) >= 1
        assert any(e.edge_type == "created_skill" for e in links)

    def test_add_edge_bidirectional(self, graph):
        graph.add_node("ep:1", "episode", "ep1")
        graph.add_node("s:1", "skill", "skill1")
        graph.add_edge("ep:1", "s:1", "created_skill")

        # Should be able to traverse from both directions
        links_from_ep = graph.get_links("ep:1")
        links_from_skill = graph.get_links("s:1")
        assert len(links_from_ep) >= 1
        assert len(links_from_skill) >= 1

    def test_add_edge_invalid_type(self, graph):
        graph.add_node("a", "fact", "fact a")
        graph.add_node("b", "fact", "fact b")
        with pytest.raises(ValueError):
            graph.add_edge("a", "b", "invalid_edge")

    def test_add_edge_missing_node(self, graph):
        graph.add_node("a", "fact", "fact a")
        with pytest.raises(ValueError):
            graph.add_edge("a", "nonexistent", "references")

    def test_traverse(self, graph):
        graph.add_node("ep:1", "episode", "ep1")
        graph.add_node("s:1", "skill", "skill1")
        graph.add_node("s:2", "skill", "skill2")
        graph.add_edge("ep:1", "s:1", "created_skill")
        graph.add_edge("s:1", "s:2", "depends_on")

        # Traverse from episode — should find skill1 (depth 1) and skill2 (depth 2)
        result = graph.traverse("ep:1", max_depth=2)
        assert "s:1" in result
        assert "s:2" in result

    def test_traverse_depth_1(self, graph):
        graph.add_node("ep:1", "episode", "ep1")
        graph.add_node("s:1", "skill", "skill1")
        graph.add_node("s:2", "skill", "skill2")
        graph.add_edge("ep:1", "s:1", "created_skill")
        graph.add_edge("s:1", "s:2", "depends_on")

        result = graph.traverse("ep:1", max_depth=1)
        assert "s:1" in result
        assert "s:2" not in result  # depth 2 not reached

    def test_find_path(self, graph):
        graph.add_node("a", "fact", "a")
        graph.add_node("b", "fact", "b")
        graph.add_node("c", "fact", "c")
        graph.add_edge("a", "b", "references")
        graph.add_edge("b", "c", "references")

        path = graph.find_path("a", "c")
        assert path is not None
        assert path[0] == "a"
        assert path[-1] == "c"

    def test_find_path_no_connection(self, graph):
        graph.add_node("a", "fact", "a")
        graph.add_node("z", "fact", "z")
        path = graph.find_path("a", "z")
        assert path is None

    def test_find_path_same_node(self, graph):
        graph.add_node("a", "fact", "a")
        path = graph.find_path("a", "a")
        assert path == ["a"]

    def test_auto_link_skill_created(self, graph):
        graph.add_node("ep:1", "episode", "ep1")
        graph.add_node("s:1", "skill", "skill1")
        graph.auto_link_skill_created("ep:1", "s:1")
        links = graph.get_links("ep:1")
        assert any(e.edge_type == "created_skill" for e in links)

    def test_auto_link_contradicts(self, graph):
        graph.add_node("a", "fact", "a")
        graph.add_node("b", "fact", "b")
        graph.auto_link_contradicts("a", "b")
        links = graph.get_links("a")
        assert any(e.edge_type == "contradicts" for e in links)

    def test_reinforce_edge(self, graph):
        graph.add_node("a", "fact", "a")
        graph.add_node("b", "fact", "b")
        graph.add_edge("a", "b", "references", weight=0.5)
        graph.reinforce_edge("a", "b", "references")

        links = graph.get_links("a")
        ref_links = [e for e in links if e.edge_type == "references"]
        assert len(ref_links) >= 1
        assert ref_links[0].weight > 0.5  # should have increased

    def test_count_nodes_and_edges(self, graph):
        graph.add_node("a", "fact", "a")
        graph.add_node("b", "fact", "b")
        graph.add_edge("a", "b", "references")
        assert graph.count_nodes() == 2
        assert graph.count_edges() == 2  # bidirectional = 2 edges

    def test_get_nodes_by_type(self, graph):
        graph.add_node("ep:1", "episode", "ep1")
        graph.add_node("s:1", "skill", "skill1")
        graph.add_node("s:2", "skill", "skill2")

        skills = graph.get_nodes_by_type("skill")
        assert len(skills) == 2
        episodes = graph.get_nodes_by_type("episode")
        assert len(episodes) == 1

    def test_get_connected(self, graph):
        graph.add_node("ep:1", "episode", "ep1")
        graph.add_node("s:1", "skill", "skill1")
        graph.add_edge("ep:1", "s:1", "created_skill")

        connected = graph.get_connected(edge_type="created_skill")
        assert len(connected) >= 1
