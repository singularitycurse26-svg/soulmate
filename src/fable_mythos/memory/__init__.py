"""Memory system package — 3-layer memory with recursive linking.

Layer 1: Working Memory (context window management)
Layer 2: Episodic Memory (SQLite + FTS5 session history)
Layer 3: Semantic Memory (ChromaDB skill library)
Plus: Knowledge graph for recursive bidirectional linking across all layers
"""
