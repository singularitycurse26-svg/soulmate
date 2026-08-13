"""HuggingFace Hub publication — publishes model package and knowledge base.

Publishes:
1. Model package: source code, config, model card to hermescures1/inc-llm-v1
2. Knowledge dataset: 32 domain seeds to hermescures1/inc-llm-v1-knowledge

Requires HF_TOKEN environment variable.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

from inc_llm.config import PublishConfig
from inc_llm.knowledge.seeds import DOMAINS

logger = logging.getLogger(__name__)

MODEL_CARD_TEMPLATE = """---
language:
  - en
library_name: transformers
tags:
  - llm
  - self-improving
  - recursive-linking
  - rlos
  - ollama
  - peer-to-peer
license: mit
---

# INC-LLM-v1: Self-Improving LLM with Universal Recursive Linking

## Description

INC-LLM-v1 is a self-improving LLM harness that wraps local Ollama models with:
- **3-layer memory system**: working, episodic, semantic memory + knowledge graph
- **Universal recursive linking**: peer-to-peer network where all instances share learnings
- **RLOS (Recursive Link Operating System)**: connection pooling, model preloading, prefix caching, batch processing, load balancing, and server mesh linking
- **32 domain knowledge seeds**: RAG-injected knowledge across programming, AI, cloud, blockchain, and more
- **Vault memory**: tiered storage (hot/warm/cold) preventing slowdown as knowledge grows
- **Tool execution loop**: LLM can call tools and use results to continue reasoning
- **Response caching**: semantic similarity-based caching to avoid redundant LLM calls
- **Telegram integration**: isolated voice/text bot with pairing codes
- **Trading APIs**: Binance, Coinbase, Kraken price feeds
- **Voice engine**: TTS (edge-tts) + STT (whisper)

## Architecture

```
User -> FastAPI Server -> IncLLMHarness
  -> MemoryManager (Working + Episodic + Semantic + KnowledgeGraph + Vault)
  -> RAGLayer (32 domain seeds + ChromaDB)
  -> ResponseCache (semantic similarity)
  -> ModelBus -> OllamaProvider -> Ollama Server
  -> RLOS (ConnectionPool + ModelManager + PrefixCache + BatchProcessor + LoadBalancer)
  -> UniversalLinkManager + UniversalMeshLink (peer sync + mesh propagation)
  -> ToolRegistry (tool execution loop)
  -> Integrations (Hermes, Jarvis, Internet, Trading, Telegram, Voice)
```

## Quick Start

### Install from PyPI

```bash
pip install inc-llm-v1[full]
inc-llm-server
```

### Install from GitHub

```bash
pip install git+https://github.com/hermescures1/inc-llm-v1.git
inc-llm-server
```

### Install from HuggingFace

```bash
pip install https://huggingface.co/hermescures1/inc-llm-v1/resolve/main/inc-llm-v1-1.0.0.tar.gz
inc-llm-server
```

### Install from source

```bash
git clone https://github.com/hermescures1/inc-llm-v1.git
cd inc-llm-v1
pip install -e ".[full]"
inc-llm-server
```

### Docker

```bash
docker-compose up -d
```

## Configuration

See `config.yaml` for all options. Key settings:
- `hardware_tier`: minimal | standard | full
- `rlos.enabled`: Enable RLOS optimization
- `universal_link.enabled`: Enable peer-to-peer learning
- `universal_mesh.enabled`: Enable mesh propagation through RLOS

## License

MIT License - see LICENSE file for details.

## Author

Soulmate OS - hawpetossjustin25@gmail.com
"""


class HuggingFacePublisher:
    """Publishes INC-LLM-v1 to Hugging Face Hub."""

    def __init__(self, config: PublishConfig) -> None:
        self.config = config
        self.hf_config = config.huggingface
        self._token: str | None = None

    @property
    def token(self) -> str | None:
        if self._token is None:
            self._token = os.environ.get(self.hf_config.token_env_var)
        return self._token

    def check_token(self) -> bool:
        """Check if HF_TOKEN is available."""
        return self.token is not None

    def generate_model_card(self) -> str:
        """Generate the model card markdown."""
        return MODEL_CARD_TEMPLATE

    def generate_knowledge_dataset(self) -> list[dict[str, Any]]:
        """Generate the knowledge dataset from domain seeds."""
        dataset = []
        for domain_id, domain in DOMAINS.items():
            dataset.append({
                "id": domain_id,
                "name": domain["name"],
                "category": domain["category"],
                "content": domain["content"],
                "keywords": domain.get("keywords", []),
            })
        return dataset

    async def publish_model(self, source_dir: str) -> dict[str, Any]:
        """Publish the model package to Hugging Face Hub."""
        if not self.hf_config.enabled:
            return {"status": "disabled"}
        if not self.check_token():
            return {"status": "error", "error": f"No {self.hf_config.token_env_var} environment variable set"}

        try:
            from huggingface_hub import HfApi, create_repo
            api = HfApi(token=self.token)

            repo_id = self.hf_config.model_repo_id
            create_repo(repo_id, repo_type="model", exist_ok=True, token=self.token)

            model_card = self.generate_model_card()
            card_path = Path(source_dir) / "README.md"
            card_path.write_text(model_card)
            api.upload_file(
                path_or_fileobj=str(card_path),
                path_in_repo="README.md",
                repo_id=repo_id,
                repo_type="model",
            )

            for py_file in Path(source_dir).rglob("*.py"):
                rel = py_file.relative_to(source_dir)
                api.upload_file(
                    path_or_fileobj=str(py_file),
                    path_in_repo=str(rel),
                    repo_id=repo_id,
                    repo_type="model",
                )

            config_path = Path(source_dir) / "config.yaml"
            if config_path.exists():
                api.upload_file(
                    path_or_fileobj=str(config_path),
                    path_in_repo="config.yaml",
                    repo_id=repo_id,
                    repo_type="model",
                )

            logger.info("Published model to %s", repo_id)
            return {"status": "ok", "repo_id": repo_id, "url": f"https://huggingface.co/{repo_id}"}
        except ImportError:
            return {"status": "error", "error": "huggingface_hub not installed. Run: pip install huggingface_hub"}
        except Exception as e:
            logger.error("Publish model failed: %s", e)
            return {"status": "error", "error": str(e)}

    async def publish_knowledge(self) -> dict[str, Any]:
        """Publish the knowledge dataset to Hugging Face Hub."""
        if not self.hf_config.enabled:
            return {"status": "disabled"}
        if not self.check_token():
            return {"status": "error", "error": f"No {self.hf_config.token_env_var} environment variable set"}

        try:
            from huggingface_hub import HfApi, create_repo
            api = HfApi(token=self.token)

            repo_id = self.hf_config.dataset_repo_id
            create_repo(repo_id, repo_type="dataset", exist_ok=True, token=self.token)

            dataset = self.generate_knowledge_dataset()
            import tempfile
            with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
                json.dump(dataset, f, indent=2)
                dataset_path = f.name

            api.upload_file(
                path_or_fileobj=dataset_path,
                path_in_repo="knowledge_seeds.json",
                repo_id=repo_id,
                repo_type="dataset",
            )

            os.unlink(dataset_path)

            logger.info("Published knowledge dataset to %s", repo_id)
            return {"status": "ok", "repo_id": repo_id, "domains": len(dataset),
                     "url": f"https://huggingface.co/datasets/{repo_id}"}
        except ImportError:
            return {"status": "error", "error": "huggingface_hub not installed. Run: pip install huggingface_hub"}
        except Exception as e:
            logger.error("Publish knowledge failed: %s", e)
            return {"status": "error", "error": str(e)}

    async def publish_all(self, source_dir: str) -> dict[str, Any]:
        """Publish both model and knowledge dataset."""
        model_result = await self.publish_model(source_dir)
        knowledge_result = await self.publish_knowledge()
        sdist_result = await self.publish_sdist(source_dir)
        return {"model": model_result, "knowledge": knowledge_result, "sdist": sdist_result}

    async def publish_sdist(self, source_dir: str) -> dict[str, Any]:
        """Build a source distribution tarball and upload to HuggingFace."""
        if not self.hf_config.enabled:
            return {"status": "disabled"}
        if not self.check_token():
            return {"status": "error", "error": f"No {self.hf_config.token_env_var} environment variable set"}

        try:
            import subprocess
            import tempfile
            from huggingface_hub import HfApi
            api = HfApi(token=self.token)

            repo_id = self.hf_config.model_repo_id

            result = subprocess.run(
                ["python", "-m", "build", "--sdist"],
                cwd=source_dir,
                capture_output=True, text=True,
            )
            if result.returncode != 0:
                return {"status": "error", "error": f"Build failed: {result.stderr}"}

            dist_dir = Path(source_dir) / "dist"
            if not dist_dir.exists():
                return {"status": "error", "error": "No dist directory found after build"}

            for tarball in dist_dir.glob("*.tar.gz"):
                api.upload_file(
                    path_or_fileobj=str(tarball),
                    path_in_repo=tarball.name,
                    repo_id=repo_id,
                    repo_type="model",
                )
                logger.info("Uploaded %s to %s", tarball.name, repo_id)

            return {"status": "ok", "repo_id": repo_id,
                     "url": f"https://huggingface.co/{repo_id}"}
        except ImportError:
            return {"status": "error", "error": "huggingface_hub or build not installed. Run: pip install huggingface_hub build"}
        except Exception as e:
            logger.error("Publish sdist failed: %s", e)
            return {"status": "error", "error": str(e)}
