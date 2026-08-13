"""RAG layer — retrieves relevant knowledge from seeds and external sources.

Provides a unified retrieval interface that:
1. Searches domain knowledge seeds
2. Optionally queries ChromaDB for vector-similar documents
3. Falls back to keyword matching when embeddings are unavailable
4. Injects retrieved knowledge into the working memory context
"""

from __future__ import annotations

import logging
from typing import Any

from inc_llm.config import KnowledgeConfig
from inc_llm.knowledge.seeds import DOMAINS, get_all_domains, search_domains

logger = logging.getLogger(__name__)


class RAGLayer:
    """Retrieval-augmented generation layer over knowledge seeds + ChromaDB."""

    def __init__(self, config: KnowledgeConfig, bus: Any = None) -> None:
        self.config = config
        self.bus = bus
        self._collection: Any = None
        self._client: Any = None
        self._seeded = False

    def seed(self) -> int:
        """Seed the ChromaDB collection with domain knowledge if available."""
        if self._seeded:
            return 0
        count = 0
        try:
            import chromadb
            self._client = chromadb.PersistentClient(
                path=str(self.config.files_dir.replace("inc_llm/knowledge/files", "~/.inc_llm/chroma")),
            )
            self._collection = self._client.get_or_create_collection(
                name=self.config.rag_collection, metadata={"hnsw:space": "cosine"},
            )
            for domain_id, domain in DOMAINS.items():
                self._collection.upsert(
                    ids=[f"seed_{domain_id}"],
                    documents=[domain["content"]],
                    metadatas=[{
                        "domain": domain_id,
                        "name": domain["name"],
                        "category": domain["category"],
                    }],
                )
                count += 1
            self._seeded = True
            logger.info("RAG seeded with %d domain knowledge entries", count)
        except Exception as e:
            logger.warning("RAG seeding failed (ChromaDB): %s, using keyword fallback", e)
            self._collection = None
        return count

    async def retrieve(self, query: str, top_k: int | None = None) -> list[dict[str, Any]]:
        """Retrieve relevant knowledge for a query."""
        k = top_k or self.config.retrieve_top_k
        results: list[dict[str, Any]] = []

        if self._collection is not None and self.bus:
            try:
                embedding = await self.bus.embed(input=query)
                chroma_results = self._collection.query(
                    query_embeddings=[embedding], n_results=k,
                )
                ids = chroma_results.get("ids", [[]])[0]
                docs = chroma_results.get("documents", [[]])[0]
                metas = chroma_results.get("metadatas", [[]])[0]
                dists = chroma_results.get("distances", [[]])[0]
                for doc_id, doc, meta, dist in zip(ids, docs, metas, dists):
                    similarity = 1.0 - dist if dist is not None else 0.5
                    if similarity >= 0.5:
                        results.append({
                            "id": doc_id, "content": doc,
                            "metadata": meta, "score": similarity,
                        })
            except Exception as e:
                logger.warning("RAG vector retrieval failed: %s", e)

        if not results:
            for domain in search_domains(query, limit=k):
                results.append({
                    "id": f"seed_{domain['id']}",
                    "content": domain["content"],
                    "metadata": {"domain": domain["id"], "name": domain["name"]},
                    "score": 0.0,
                })

        return results[:k]

    def retrieve_sync(self, query: str, top_k: int | None = None) -> list[dict[str, Any]]:
        """Synchronous retrieval using keyword matching only."""
        k = top_k or self.config.retrieve_top_k
        results: list[dict[str, Any]] = []
        for domain in search_domains(query, limit=k):
            results.append({
                "id": f"seed_{domain['id']}",
                "content": domain["content"],
                "metadata": {"domain": domain["id"], "name": domain["name"]},
                "score": 0.0,
            })
        return results[:k]

    def format_for_context(self, results: list[dict[str, Any]]) -> str:
        """Format retrieved knowledge for injection into working memory."""
        if not results:
            return ""
        parts: list[str] = []
        for r in results:
            meta = r.get("metadata", {})
            domain_name = meta.get("name", meta.get("domain", "unknown"))
            parts.append(f"### {domain_name}\n{r['content']}")
        return "\n\n".join(parts)

    def get_stats(self) -> dict[str, int]:
        return {
            "domains": len(DOMAINS),
            "seeded": 1 if self._seeded else 0,
        }
