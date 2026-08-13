"""32 domain knowledge seeds — structured knowledge for RAG injection.

Each domain contains key facts, patterns, and reference material that the LLM
can use as context. Seeds are loaded at startup and indexed for retrieval.
"""

from __future__ import annotations

from typing import Any

DOMAINS: dict[str, dict[str, Any]] = {
    "python": {
        "name": "Python",
        "category": "programming",
        "content": (
            "Python is a high-level, interpreted language with dynamic typing. "
            "Key features: list/dict comprehensions, decorators, context managers, "
            "async/await, type hints (PEP 484), dataclasses, pathlib, f-strings. "
            "Package management: pip, venv, poetry. Testing: pytest, unittest. "
            "Linting: ruff, mypy. Web: FastAPI, Django, Flask. "
            "Best practices: EAFP over LBYL, explicit over implicit, readable code. "
            "GIL limits true threading for CPU work — use multiprocessing or asyncio."
        ),
        "keywords": ["python", "pip", "django", "flask", "fastapi", "pytest", "asyncio"],
    },
    "javascript": {
        "name": "JavaScript",
        "category": "programming",
        "content": (
            "JavaScript is a dynamic, multi-paradigm language. ES6+ features: "
            "arrow functions, destructuring, template literals, async/await, "
            "modules (import/export), optional chaining, nullish coalescing. "
            "Runtime: Node.js (V8), Bun, Deno. Package managers: npm, yarn, pnpm. "
            "Frameworks: React, Vue, Svelte, Next.js, Express, Fastify. "
            "TypeScript adds static typing. Testing: Jest, Vitest, Playwright."
        ),
        "keywords": ["javascript", "node", "npm", "react", "vue", "typescript", "express"],
    },
    "go": {
        "name": "Go",
        "category": "programming",
        "content": (
            "Go (Golang) is a statically typed, compiled language by Google. "
            "Features: goroutines (lightweight threads), channels, interfaces, "
            "struct embedding, defer, go modules. No inheritance, no generics until 1.18. "
            "Standard library is comprehensive: net/http, encoding/json, context. "
            "Concurrency: 'Do not communicate by sharing memory; share memory by communicating.' "
            "Tooling: go build, go test, go vet, golangci-lint."
        ),
        "keywords": ["go", "golang", "goroutine", "channel", "grpc"],
    },
    "rust": {
        "name": "Rust",
        "category": "programming",
        "content": (
            "Rust is a systems language with memory safety without GC. "
            "Ownership model: each value has one owner, borrowed via & or &mut. "
            "Lifetimes prevent dangling references. Traits define shared behavior. "
            "Enums are algebraic data types with pattern matching. "
            "Cargo is the build system and package manager. "
            "Ecosystem: tokio (async), serde (serialization), axum/actix (web). "
            "Macros: declarative (macro_rules!) and procedural."
        ),
        "keywords": ["rust", "cargo", "ownership", "borrow", "trait", "tokio"],
    },
    "systems_architecture": {
        "name": "Systems Architecture",
        "category": "architecture",
        "content": (
            "Key patterns: monolith vs microservices vs serverless. "
            "Event-driven: pub/sub, event sourcing, CQRS. "
            "Data patterns: sagas, outbox, CDC, materialized views. "
            "Communication: REST, gRPC, GraphQL, message queues (RabbitMQ, Kafka, NATS). "
            "Consistency: ACID, BASE, eventual, strong, causal. CAP theorem. "
            "Design: idempotency, circuit breakers, bulkheads, rate limiting. "
            "Observability: metrics, logs, traces (OpenTelemetry)."
        ),
        "keywords": ["architecture", "microservices", "grpc", "kafka", "cqrs", "saga"],
    },
    "devops": {
        "name": "DevOps",
        "category": "operations",
        "content": (
            "DevOps integrates development and operations. CI/CD pipelines: "
            "build, test, deploy, monitor. Infrastructure as Code: Terraform, "
            "Pulumi, Ansible. Container orchestration: Kubernetes, Docker Swarm. "
            "Monitoring: Prometheus, Grafana, Datadog, ELK stack. "
            "Secrets: Vault, AWS Secrets Manager, Sealed Secrets. "
            "GitOps: ArgoCD, Flux. Service mesh: Istio, Linkerd."
        ),
        "keywords": ["devops", "ci", "cd", "terraform", "ansible", "prometheus", "grafana"],
    },
    "docker": {
        "name": "Docker",
        "category": "operations",
        "content": (
            "Docker containers package applications with dependencies. "
            "Dockerfile: FROM, RUN, COPY, CMD, ENTRYPOINT, ENV, EXPOSE, VOLUME. "
            "Multi-stage builds reduce image size. BuildKit enables advanced features. "
            "Best practices: .dockerignore, non-root user, minimal base images (alpine, distroless). "
            "Docker Compose for multi-container dev. Networks: bridge, host, overlay. "
            "Volumes vs bind mounts for persistent data."
        ),
        "keywords": ["docker", "container", "dockerfile", "compose", "image"],
    },
    "kubernetes": {
        "name": "Kubernetes",
        "category": "operations",
        "content": (
            "Kubernetes orchestrates containerized workloads. Core objects: "
            "Pod, Deployment, Service, ConfigMap, Secret, Ingress, StatefulSet, DaemonSet, Job, CronJob. "
            "Controllers reconcile desired vs actual state. Scheduling: node selectors, "
            "affinity/anti-affinity, taints/tolerations, resource requests/limits. "
            "HPA/VPA for autoscaling. Helm for package management. "
            "Operators extend K8s with custom resources and controllers."
        ),
        "keywords": ["kubernetes", "k8s", "pod", "deployment", "helm", "ingress", "hpa"],
    },
    "machine_learning": {
        "name": "Machine Learning",
        "category": "ai",
        "content": (
            "ML paradigms: supervised, unsupervised, reinforcement, self-supervised. "
            "Key algorithms: linear/logistic regression, decision trees, random forests, "
            "SVM, k-means, PCA, gradient boosting (XGBoost, LightGBM). "
            "Metrics: accuracy, precision, recall, F1, ROC-AUC, MSE, MAE. "
            "Cross-validation, train/val/test splits, regularization (L1/L2, dropout). "
            "Bias-variance tradeoff. Feature engineering, normalization, encoding. "
            "Libraries: scikit-learn, pandas, numpy, scipy."
        ),
        "keywords": ["ml", "machine learning", "scikit", "regression", "classification", "xgboost"],
    },
    "deep_learning": {
        "name": "Deep Learning",
        "category": "ai",
        "content": (
            "Neural networks: perceptrons, MLPs, activation functions (ReLU, GELU, sigmoid, tanh). "
            "Backpropagation, gradient descent, optimizers (SGD, Adam, AdamW). "
            "Architectures: CNNs (ResNet, EfficientNet), RNNs/LSTMs, Transformers (attention, "
            "self-attention, multi-head). Frameworks: PyTorch, TensorFlow, JAX. "
            "Training: batch normalization, layer norm, learning rate scheduling, "
            "early stopping, mixed precision. Transfer learning and fine-tuning."
        ),
        "keywords": ["deep learning", "neural network", "pytorch", "tensorflow", "transformer", "cnn"],
    },
    "nlp": {
        "name": "NLP",
        "category": "ai",
        "content": (
            "NLP: tokenization, stemming, lemmatization, POS tagging, NER, parsing. "
            "Embeddings: Word2Vec, GloVe, FastText, contextual (BERT, GPT). "
            "Models: BERT (encoder), GPT (decoder), T5 (encoder-decoder), LLaMA, Qwen. "
            "Techniques: attention, fine-tuning, LoRA, QLoRA, RLHF, DPO. "
            "Tasks: classification, NER, QA, summarization, translation, generation. "
            "Libraries: transformers, spaCy, NLTK, LangChain. Tokenizers: BPE, SentencePiece."
        ),
        "keywords": ["nlp", "bert", "gpt", "llm", "transformers", "embedding", "lora", "rlhf"],
    },
    "computer_vision": {
        "name": "Computer Vision",
        "category": "ai",
        "content": (
            "CV tasks: classification, detection (YOLO, R-CNN), segmentation (U-Net, Mask R-CNN), "
            "OCR, face recognition, pose estimation. Preprocessing: resize, normalize, augment "
            "(flip, rotate, crop, color jitter). Architectures: CNNs, ViTs, CLIP, DINO. "
            "Datasets: ImageNet, COCO, CIFAR. Metrics: mAP, IoU, pixel accuracy. "
            "Libraries: OpenCV, PIL, torchvision, albumentations."
        ),
        "keywords": ["computer vision", "cnn", "yolo", "opencv", "segmentation", "detection"],
    },
    "web_development": {
        "name": "Web Development",
        "category": "programming",
        "content": (
            "Frontend: HTML5, CSS3, Flexbox, Grid, responsive design, PWA. "
            "Backend: REST, GraphQL, WebSocket, SSE. Authentication: JWT, OAuth2, OIDC, sessions. "
            "State management: Redux, Zustand, Pinia, Context API. "
            "Build tools: Vite, Webpack, esbuild, Turbopack. "
            "SSR/SSG: Next.js, Nuxt, Astro, SvelteKit. "
            "Web performance: Core Web Vitals, lazy loading, code splitting, CDN."
        ),
        "keywords": ["web", "html", "css", "rest", "graphql", "jwt", "vite", "nextjs"],
    },
    "api_design": {
        "name": "API Design",
        "category": "architecture",
        "content": (
            "REST principles: statelessness, uniform interface, layered system, cacheable. "
            "HTTP methods: GET (safe), POST (create), PUT/PATCH (update), DELETE. "
            "Status codes: 2xx success, 3xx redirect, 4xx client error, 5xx server error. "
            "Versioning: URL path, header, query param. Pagination: offset, cursor, keyset. "
            "GraphQL: schema, queries, mutations, subscriptions, resolvers. "
            "gRPC: protobuf, streaming, interceptors. API docs: OpenAPI/Swagger."
        ),
        "keywords": ["api", "rest", "graphql", "grpc", "openapi", "swagger", "http"],
    },
    "database_design": {
        "name": "Database Design",
        "category": "data",
        "content": (
            "Relational: normalization (1NF-BCNF), denormalization for read performance. "
            "Indexing: B-tree, hash, GIN, GiST, partial, composite. "
            "ACID properties, isolation levels (read uncommitted, read committed, "
            "repeatable read, serializable). Sharding, partitioning, replication. "
            "NoSQL: document (MongoDB), key-value (Redis), wide-column (Cassandra), graph (Neo4j). "
            "NewSQL: CockroachDB, TiDB. Time-series: TimescaleDB, InfluxDB."
        ),
        "keywords": ["database", "sql", "nosql", "mongodb", "redis", "postgres", "index"],
    },
    "sql": {
        "name": "SQL",
        "category": "data",
        "content": (
            "SQL: SELECT, INSERT, UPDATE, DELETE, JOIN (inner, left, right, full, cross). "
            "Subqueries, CTEs (WITH), window functions (ROW_NUMBER, RANK, LAG, LEAD). "
            "Aggregates: COUNT, SUM, AVG, MIN, MAX, GROUP BY, HAVING. "
            "DDL: CREATE, ALTER, DROP, TRUNCATE. DML and DCL. "
            "PostgreSQL features: JSONB, arrays, full-text search, materialized views, "
            "extensions (pg_trgm, pgvector). Query optimization: EXPLAIN ANALYZE."
        ),
        "keywords": ["sql", "postgres", "mysql", "join", "cte", "window function", "index"],
    },
    "nosql": {
        "name": "NoSQL",
        "category": "data",
        "content": (
            "NoSQL types: document (MongoDB, CouchDB), key-value (Redis, DynamoDB), "
            "wide-column (Cassandra, HBase), graph (Neo4j, ArangoDB). "
            "Trade-offs: BASE vs ACID, eventual consistency, CAP theorem. "
            "MongoDB: collections, documents, aggregation pipeline, indexes. "
            "Redis: data structures (strings, lists, sets, hashes, streams), pub/sub, "
            "persistence (RDB, AOF), clustering. Cassandra: partition key, clustering key, "
            "tunable consistency."
        ),
        "keywords": ["nosql", "mongodb", "redis", "cassandra", "dynamodb", "neo4j"],
    },
    "security": {
        "name": "Security",
        "category": "security",
        "content": (
            "OWASP Top 10: injection, broken auth, sensitive data exposure, XXE, "
            "broken access control, security misconfiguration, XSS, insecure deserialization, "
            "known vulnerabilities, insufficient logging. Defense: input validation, "
            "parameterized queries, output encoding, CSP, CORS, HSTS. "
            "AuthN: passwords (bcrypt, argon2), MFA, WebAuthn. AuthZ: RBAC, ABAC. "
            "Secrets management, dependency scanning (Snyk, Dependabot)."
        ),
        "keywords": ["security", "owasp", "xss", "csrf", "injection", "authentication", "authorization"],
    },
    "cryptography": {
        "name": "Cryptography",
        "category": "security",
        "content": (
            "Symmetric: AES (128/192/256), ChaCha20, modes (GCM, CBC, CTR). "
            "Asymmetric: RSA, ECC (secp256k1, ed25519), Diffie-Hellman. "
            "Hashing: SHA-256, SHA-3, BLAKE2/3, bcrypt, scrypt, argon2 (for passwords). "
            "MACs: HMAC, Poly1305. Digital signatures: ECDSA, EdDSA. "
            "TLS 1.3: handshake, cipher suites, forward secrecy. "
            "Zero-knowledge proofs: zk-SNARKs, zk-STARKs. Homomorphic encryption."
        ),
        "keywords": ["crypto", "aes", "rsa", "sha256", "tls", "encryption", "hash", "signature"],
    },
    "blockchain": {
        "name": "Blockchain",
        "category": "blockchain",
        "content": (
            "Blockchain: distributed ledger, blocks, chains, consensus (PoW, PoS, DPoS, BFT). "
            "Ethereum: EVM, gas, smart contracts (Solidity, Vyper), accounts (EOA, contract). "
            "Tokens: ERC-20 (fungible), ERC-721 (NFT), ERC-1155 (multi-token). "
            "DeFi: DEX, lending, AMM (Uniswap), yield farming. "
            "Layer 2: rollups (Optimistic, ZK), sidechains, state channels. "
            "Web3: ethers.js, web3.py, viem, wagmi. IPFS for decentralized storage."
        ),
        "keywords": ["blockchain", "ethereum", "solidity", "nft", "defi", "evm", "erc20", "web3"],
    },
    "smart_contracts": {
        "name": "Smart Contracts",
        "category": "blockchain",
        "content": (
            "Solidity: contracts, functions, modifiers, events, structs, enums, mappings. "
            "Storage vs memory vs calldata. Gas optimization: packed structs, "
            "batch operations, assembly (Yul). Security: reentrancy (checks-effects-interactions), "
            "integer overflow (SafeMath, 0.8+ built-in), access control, Pausable. "
            "Testing: Foundry, Hardhat, Brownie. Verification: Etherscan, Sourcify. "
            "Standards: ERC-20, ERC-721, ERC-4626, EIP-2612 (permit)."
        ),
        "keywords": ["solidity", "smart contract", "foundry", "hardhat", "gas", "reentrancy", "erc"],
    },
    "data_science": {
        "name": "Data Science",
        "category": "data",
        "content": (
            "Data pipeline: collection, cleaning, EDA, feature engineering, modeling, deployment. "
            "pandas: DataFrames, Series, groupby, merge, pivot, time series. "
            "Visualization: matplotlib, seaborn, plotly, bokeh. "
            "Statistics: distributions, hypothesis testing, A/B testing, confidence intervals. "
            "Big data: Spark, Dask, Ray, Polars. MLOps: MLflow, Weights & Biases, DVC. "
            "Feature stores: Feast, Tecton. Data quality: Great Expectations, dbt."
        ),
        "keywords": ["data science", "pandas", "spark", "visualization", "statistics", "mlops"],
    },
    "statistics": {
        "name": "Statistics",
        "category": "math",
        "content": (
            "Descriptive: mean, median, mode, variance, std dev, quartiles, IQR. "
            "Distributions: normal, binomial, Poisson, exponential, beta, gamma. "
            "Inferential: hypothesis testing, p-values, t-tests, chi-square, ANOVA. "
            "Bayesian: prior, likelihood, posterior, Bayes' theorem, MCMC. "
            "Correlation vs causation. Regression: linear, logistic, polynomial. "
            "Sampling: random, stratified, cluster, bootstrap. "
            "Confidence intervals, margin of error, statistical power."
        ),
        "keywords": ["statistics", "probability", "bayesian", "hypothesis", "distribution", "regression"],
    },
    "math": {
        "name": "Mathematics",
        "category": "math",
        "content": (
            "Linear algebra: vectors, matrices, eigenvalues/eigenvectors, SVD, PCA. "
            "Calculus: derivatives, integrals, partial derivatives, gradients, Jacobians. "
            "Optimization: convex vs non-convex, gradient descent, Lagrange multipliers. "
            "Discrete math: set theory, combinatorics, graph theory, recurrence relations. "
            "Probability: sample space, events, conditional probability, Bayes' theorem. "
            "Information theory: entropy, mutual information, KL divergence."
        ),
        "keywords": ["math", "linear algebra", "calculus", "optimization", "probability", "entropy"],
    },
    "algorithms": {
        "name": "Algorithms",
        "category": "cs",
        "content": (
            "Complexity: Big-O, Big-Theta, Big-Omega, amortized analysis. "
            "Sorting: quicksort, mergesort, heapsort, timsort, counting sort. "
            "Searching: binary search, hash tables, BST, trie. "
            "Graph: BFS, DFS, Dijkstra, A*, Bellman-Ford, Floyd-Warshall, topological sort. "
            "Dynamic programming: memoization, tabulation, common patterns. "
            "Greedy algorithms, divide and conquer, backtracking. "
            "String: KMP, Rabin-Karp, Z-algorithm, suffix arrays."
        ),
        "keywords": ["algorithm", "big-o", "sorting", "graph", "dynamic programming", "complexity"],
    },
    "data_structures": {
        "name": "Data Structures",
        "category": "cs",
        "content": (
            "Arrays, linked lists, stacks, queues, deques. "
            "Hash tables: chaining, open addressing, load factor, rehashing. "
            "Trees: BST, AVL, red-black, B-tree, trie, segment tree, Fenwick tree. "
            "Heaps: min-heap, max-heap, binary heap, Fibonacci heap. "
            "Graphs: adjacency list, adjacency matrix, edge list. "
            "Disjoint set (union-find): path compression, union by rank. "
            "Advanced: skip lists, bloom filters, LRU cache, persistent structures."
        ),
        "keywords": ["data structure", "tree", "hash table", "heap", "graph", "trie", "bloom filter"],
    },
    "cloud_aws": {
        "name": "Cloud (AWS)",
        "category": "cloud",
        "content": (
            "AWS core: EC2 (compute), S3 (storage), RDS (databases), VPC (networking). "
            "Serverless: Lambda, API Gateway, Step Functions, DynamoDB. "
            "Containers: ECS, EKS, Fargate, ECR. "
            "IAM: users, roles, policies, STS. CloudWatch for monitoring. "
            "CDN: CloudFront. DNS: Route 53. Queue: SQS, SNS. "
            "IaC: CloudFormation, CDK, SAM. Cost optimization: spot instances, reserved, savings plans."
        ),
        "keywords": ["aws", "ec2", "s3", "lambda", "dynamodb", "iam", "eks", "cloudfront"],
    },
    "cloud_gcp": {
        "name": "Cloud (GCP)",
        "category": "cloud",
        "content": (
            "GCP core: Compute Engine, Cloud Storage, Cloud SQL, VPC. "
            "Serverless: Cloud Functions, Cloud Run, App Engine. "
            "Containers: GKE, Artifact Registry. Data: BigQuery, Dataflow, Pub/Sub. "
            "AI/ML: Vertex AI, TPU, AI Platform. IAM: service accounts, roles. "
            "Networking: Cloud CDN, Load Balancing, Cloud DNS. "
            "IaC: Deployment Manager, Terraform. Operations: Cloud Logging, Cloud Monitoring."
        ),
        "keywords": ["gcp", "google cloud", "gke", "bigquery", "cloud run", "vertex ai", "pubsub"],
    },
    "cloud_azure": {
        "name": "Cloud (Azure)",
        "category": "cloud",
        "content": (
            "Azure core: VMs, Blob Storage, Azure SQL, Virtual Network. "
            "Serverless: Functions, Logic Apps, Container Apps. "
            "Containers: AKS, Container Instances, ACR. "
            "Data: Cosmos DB, Synapse, Data Factory. AI: Azure OpenAI, Cognitive Services. "
            "IAM: Entra ID (Azure AD), RBAC. CDN: Azure CDN Front Door. "
            "IaC: ARM templates, Bicep, Terraform. Monitoring: Azure Monitor, Log Analytics."
        ),
        "keywords": ["azure", "aks", "cosmos db", "azure ad", "bicep", "azure openai", "functions"],
    },
    "cicd": {
        "name": "CI/CD",
        "category": "operations",
        "content": (
            "CI/CD pipelines: source, build, test, package, deploy, verify. "
            "Tools: GitHub Actions, GitLab CI, Jenkins, CircleCI, ArgoCD, Flux. "
            "Strategies: blue-green, canary, rolling, feature flags, progressive delivery. "
            "Testing in pipeline: unit, integration, e2e, security (SAST/DAST), performance. "
            "Artifact management: registry, SBOM, signed images (cosign). "
            "GitOps: declarative infra, PR-based deploys, drift detection."
        ),
        "keywords": ["ci", "cd", "github actions", "jenkins", "gitlab", "argocd", "canary", "gitops"],
    },
    "testing": {
        "name": "Testing",
        "category": "engineering",
        "content": (
            "Test pyramid: unit (many, fast), integration (fewer), e2e (few, slow). "
            "Unit: mocks, stubs, fakes, patches. Coverage: line, branch, path. "
            "Integration: test containers, database fixtures. "
            "E2E: Playwright, Cypress, Selenium. Property-based: Hypothesis, QuickCheck. "
            "TDD: red-green-refactor. BDD: Cucumber, Gerkin. "
            "Performance: k6, Locust, JMeter. Fuzzing: AFL, libFuzzer. "
            "Mutation testing: mutmut, Stryker."
        ),
        "keywords": ["testing", "unit test", "pytest", "playwright", "cypress", "tdd", "mock", "coverage"],
    },
    "git": {
        "name": "Git",
        "category": "engineering",
        "content": (
            "Git: distributed VCS. Commands: clone, add, commit, push, pull, fetch, merge, rebase. "
            "Branching: feature branches, gitflow, trunk-based development. "
            "Rebase vs merge: rebase rewrites history (linear), merge preserves it. "
            "Advanced: cherry-pick, reflog, bisect, stash, worktree, submodules. "
            "Hooks: pre-commit, pre-push, commit-msg. GitHub: PRs, reviews, actions. "
            "Best practices: atomic commits, conventional commits, small PRs."
        ),
        "keywords": ["git", "github", "branch", "merge", "rebase", "pull request", "commit"],
    },
    "linux": {
        "name": "Linux",
        "category": "operations",
        "content": (
            "Linux: kernel, user space, filesystem (ext4, xfs, btrfs). "
            "Commands: ls, cd, cp, mv, rm, find, grep, awk, sed, tar, chmod, chown. "
            "Process: ps, top, htop, kill, signal, nice, systemd. "
            "Network: ip, ss, netstat, curl, wget, ssh, scp, rsync. "
            "Text: cat, less, head, tail, cut, sort, uniq, tr, tee. "
            "Shell: bash, zsh, fish. Scripting: variables, pipes, redirects, subshells. "
            "Performance: iostat, vmstat, strace, perf, flame graphs."
        ),
        "keywords": ["linux", "bash", "shell", "systemd", "ssh", "grep", "awk", "sed"],
    },
    "cascade_hybrid": {
        "name": "Cascade Hybrid Knowledge",
        "category": "meta",
        "content": (
            "Cascade is an AI coding assistant operating inside the user's IDE. "
            "It uses a hybrid approach: agentic tool calling + code search + file editing. "
            "Key tools: code_search (semantic grep), read_file, edit, multi_edit, write_to_file, "
            "run_command, grep_search, find_by_name, list_dir. "
            "Best practices: batch independent tool calls, use code_search first for exploration, "
            "prefer minimal edits, verify before asserting, follow existing code style. "
            "Communication: terse, direct, no fluff. Markdown formatting with citations. "
            "Always use absolute file paths. Never add comments unless asked."
        ),
        "keywords": ["cascade", "ide", "coding assistant", "tool calling", "code search", "edit"],
    },
    "conversation_skill_system": {
        "name": "Conversation Skill System",
        "category": "ai_systems",
        "content": (
            "incllmv2's conversation skill creation system watches how users talk and creates "
            "conversation skills for smoother replies. It analyzes: tone (casual, formal, neutral), "
            "formality level, sentence length, vocabulary level, emoji usage, question frequency, "
            "technical level, and verbosity. After 3 interactions with a consistent style, it creates "
            "a conversation skill that adjusts response tone, length, and style. Skills are shared "
            "via universal recursive linking — all instances learn conversation patterns. "
            "The system runs post-turn in background (zero-slowdown) using asyncio.create_task. "
            "Skills are stored in SkillManager with category 'conversation' and linked to episodes "
            "via the knowledge graph."
        ),
        "keywords": ["conversation", "skill", "tone", "style", "casual", "formal", "chat", "dialogue"],
    },
    "code_skill_system": {
        "name": "Code Writing Skill System",
        "category": "ai_systems",
        "content": (
            "incllmv2's code writing skill creation system watches its own code output and creates "
            "code skills to write better code. It detects: language (Python, JavaScript, Go, Rust, SQL), "
            "patterns (async, classes, error handling, decorators, type hints), style (functional, OOP), "
            "task type (function, class, API, test, bugfix, refactor), and complexity. After analyzing "
            "code blocks in responses, it creates skills with category 'coding'. Cross-language skills "
            "are created when a pattern appears in 5+ instances across 2+ languages. Skills track "
            "success rate (code that didn't need fixes vs code that did). Runs post-turn in background "
            "(zero-slowdown). Shared via universal recursive linking."
        ),
        "keywords": ["code", "skill", "coding", "programming", "patterns", "cross-language", "self-improving"],
    },
    "mega_vault_storage": {
        "name": "Mega Vault Storage System",
        "category": "ai_systems",
        "content": (
            "incllmv2's mega mass storage vault is designed for 1000 years of learning. Three tiers: "
            "hot (in-memory cache + SQLite, instant access), warm (SQLite with lazy loading), "
            "cold (compressed gzip files, unlimited capacity). Auto-sizing detects disk space at "
            "startup and assigns quotas per hardware tier: mobile (50MB hot, 500MB cold, 10K items) "
            "to datacenter (100GB hot, unlimited cold, unlimited items). Auto-expansion: when a tier "
            "reaches 90% capacity, automatically expands quota if disk allows. When disk is full, "
            "triggers aggressive re-compression (gzip level 9) and archiving. On mobile, auto-prunes "
            "oldest cold items. The hot path never slows down — only hot tier is queried during "
            "inference. Background maintenance runs hourly."
        ),
        "keywords": ["vault", "storage", "mega", "auto-sizing", "auto-expansion", "tiered", "compression", "1000-year"],
    },
    "speed_skill_system": {
        "name": "Speed Skill Auto-Tuning System",
        "category": "ai_systems",
        "content": (
            "incllmv2's speed skill creation system uses precision mathematics to auto-tune reply "
            "speed across all channels (Jarvis, Hermes, Telegram, AI Gaming, CLI, API, Web, App). "
            "It records tokens_per_second, latency percentiles (p50/p90/p99), cache hit rate, and "
            "error rate per channel+hardware tier. After min_interactions responses, it computes "
            "optimal parameters using exact formulas: optimal_max_tokens = clamp(target_time * "
            "measured_tps, 16, hardware_max), optimal_num_ctx = clamp(base_ctx * speed_multiplier, "
            "256, hardware_max_ctx), optimal_temperature = base_temp * (1 - error_rate * 0.5). "
            "Speed skills (category 'speed_tuning') are shared via universal recursive link so all "
            "instances learn which parameters produce the fastest replies. Urgency detection: short "
            "voice commands get high urgency (fewer tokens), complex queries get low urgency (more "
            "tokens). Runs post-turn via asyncio.create_task — zero-slowdown. Works on phones — "
            "no GPU, no weight changes, pure harness-level software."
        ),
        "keywords": ["speed", "tuning", "auto-tune", "fast reply", "urgency", "precision", "tokens_per_second", "latency", "performance"],
    },
    "meta_learner_system": {
        "name": "Harness-Level Meta-Learning System",
        "category": "ai_systems",
        "content": (
            "incllmv2's meta-learner improves skill selection without changing model weights. "
            "It tracks which skills the LLM uses, how effective they are, and learns to select "
            "skills more intelligently over time. Effectiveness scoring (exact formula): "
            "combined_score = 0.5 * success_rate + 0.3 * user_satisfaction + 0.2 * reuse_rate. "
            "Creates meta-skills (category 'meta') about HOW to use skills — e.g., 'For Telegram "
            "channel, shorter responses get higher satisfaction.' Discovers skill synergies: "
            "when skills A + B together produce better results than either alone. Re-ranks skills "
            "during context prefetch: final_score = 0.4 * relevance + 0.4 * effectiveness + "
            "0.2 * channel_preference. Detects user feedback (positive/negative signals) and "
            "follow-up corrections. All analysis runs post-turn via asyncio.create_task — "
            "zero-slowdown. Meta-learnings shared via universal recursive link. Works on phones — "
            "pure software on the harness, no GPU needed."
        ),
        "keywords": ["meta-learning", "skill selection", "effectiveness", "synergy", "self-improving", "harness", "optimization", "re-ranking"],
    },
    "ai_gaming_companion": {
        "name": "AI Gaming MPC Companion System",
        "category": "ai_systems",
        "content": (
            "incllmv2's AI Gaming MPC is a realistic AI companion that lives in an app — handles "
            "everything you ask with no limitations as an AI assistant, and can also leave the app "
            "to go play games. Tied directly to the incllmv2 harness for full intelligence. "
            "Companion mode: persistent personality with configurable traits (friendly, competitive, "
            "analytical, creative, cautious, bold, humorous, serious, supportive, independent). "
            "Emotional state: mood, energy, excitement, frustration — all decay over time and affect "
            "response style. Relationship tracking: shared experiences, inside jokes, user preferences, "
            "relationship level (0-100). Autonomous game playing: the companion independently decides "
            "and acts in game worlds across 10 game types (strategy, RPG, sandbox, competitive, "
            "cooperative, puzzle, simulation, adventure, card, board). Game decisions are routed "
            "through the LLM with personality and emotional context. Companion chat routes through "
            "the LLM harness with auto-detect fast reply tuning. Pairing flow: 6-digit code like "
            "Telegram. All state persisted in SQLite. Zero-slowdown: all operations async."
        ),
        "keywords": ["ai gaming", "companion", "personality", "emotional", "autonomous", "game playing", "relationship", "mpc", "realistic ai person"],
    },
    "split_bit_mathematics": {
        "name": "Split-Bit Precision Mathematics",
        "category": "ai_systems",
        "content": (
            "incllmv2's split-bit mathematics system implements sub-byte quantization and "
            "mixed-precision arithmetic for all 8 hardware tiers. Based on BitNet b1.58 research: "
            "ternary quantization uses weights {-1, 0, +1} at 1.585 bits/weight (log2(3)), achieving "
            "10.13x compression vs FP16 with minimal quality loss. Formula: W_q = RoundClip(W/gamma, "
            "-1, 1) where gamma = average(|W|). Per-tier assignments: Mobile (ternary 1.58-bit), "
            "Minimal (Q2_K 2-bit), Light (Q3_K_S 3-bit), Standard (Q4_K_M 4-bit), Full (Q5_K_M 5-bit), "
            "Maximum (Q8_0 8-bit), Datacenter (FP8 E4M3 8-bit), Supercomputer (FP16/BF16 16-bit — "
            "zero quality loss). Quality loss estimate: 1 - (1 - bpw/16)^layers. Mixed-precision: "
            "FP8 for datacenter (4 exponent + 3 mantissa bits, dynamic range 256), FP4 for extreme "
            "compression (2 exponent + 1 mantissa, range 16), INT4 for integer arithmetic (range "
            "[-8, 7], scale = max(|W|)/7). Effective precision: bpw * (1 - overflow_rate). "
            "Throughput estimate: total_bandwidth / (model_size_gb * 2). All math is O(1) — "
            "zero-slowdown, used during parameter computation not inference."
        ),
        "keywords": ["split-bit", "quantization", "ternary", "1.58-bit", "bitnet", "mixed precision", "fp8", "fp4", "int4", "compression", "precision", "sub-byte"],
    },
    "geometry_gaming_math": {
        "name": "Geometry Mathematics for AI Gaming",
        "category": "ai_systems",
        "content": (
            "incllmv2's geometry math module provides vector, matrix, quaternion, and game physics "
            "operations for the AI Gaming MPC companion's spatial reasoning. Vec3 operations: dot "
            "(a·b = Σa_i*b_i), cross (a×b for perpendicular vectors), magnitude (|v| = sqrt(v·v)), "
            "normalize, distance, angle_between (acos(a·b/(|a|*|b|))), lerp (a+(b-a)*t), slerp "
            "(spherical interpolation for smooth rotations). Matrix4: identity, translate, scale, "
            "rotate_x/y/z, multiply (M1*M2 for transform composition), transform_point, look_at "
            "(camera view matrix). Quaternions: from_axis_angle (q = cos(θ/2) + sin(θ/2)*axis), "
            "from_euler, multiply (Hamilton product for composing rotations), slerp (smooth rotation "
            "interpolation without gimbal lock), to_matrix. Game physics: collision_sphere_sphere "
            "(distance < r1+r2), collision_aabb (axis-aligned bounding box overlap), "
            "ray_sphere_intersect (quadratic equation discriminant), trajectory (p0 + v*t + 0.5*g*t²), "
            "field_of_view (angle < fov/2). Emotional geometry: emotional_slerp uses Hermite smoothstep "
            "(3t² - 2t³) for natural mood transitions, emotional_oscillation (base + amplitude*sin(2πft)) "
            "for dynamic personality. compute_game_decision_context gives the LLM spatial reasoning: "
            "distance, direction, visibility, obstacles, recommended action. All O(1) — zero-slowdown."
        ),
        "keywords": ["geometry", "vector", "matrix", "quaternion", "collision", "raycast", "trajectory", "spatial", "3d", "rotation", "slerp", "game physics", "fov"],
    },
    "gaming_skill_system": {
        "name": "AI Gaming Auto-Skill Creation System",
        "category": "ai_systems",
        "content": (
            "incllmv2's gaming skill creator automatically creates skills about game strategies and "
            "companion behavior. It watches: game decisions (which strategies work per game type), "
            "companion dialogue (which personality traits get positive responses), emotional patterns "
            "(which states lead to better satisfaction), and relationship building (which conversation "
            "patterns strengthen bonds). Skill categories: gaming_strategy (optimal strategies per game "
            "type with win rates and best/worst decisions), gaming_companion (dialogue styles with "
            "satisfaction rates and relationship gain), gaming_emotional (emotional state patterns), "
            "gaming_relationship (relationship-building patterns). After min_games (default 3) game "
            "decisions, creates strategy skills. After min_interactions (default 5) companion "
            "interactions, creates companion style skills. get_optimal_strategy() provides O(1) lookup "
            "before game decisions to inform the LLM prompt. get_companion_style() recommends the best "
            "dialogue style based on satisfaction and relationship gain. Skills are shared via universal "
            "recursive link — all instances learn which game strategies and companion behaviors work. "
            "Integrated with meta-learner for effectiveness re-ranking. All analysis runs post-turn via "
            "asyncio.create_task — zero-slowdown, works on phones."
        ),
        "keywords": ["gaming skill", "auto-skill", "game strategy", "companion", "dialogue style", "win rate", "satisfaction", "relationship", "self-improving", "recursive link"],
    },
    "youtube_video_understanding": {
        "name": "YouTube Video Understanding System",
        "category": "ai_systems",
        "content": (
            "incllmv2's YouTube integration accepts a YouTube URL and extracts knowledge from the video. "
            "Transcript extraction uses youtube-transcript-api (fast path) with yt-dlp + Whisper fallback "
            "for videos without captions. Metadata is fetched via yt-dlp --dump-json. The LLM analyzes "
            "the transcript with a structured JSON prompt to produce: summary, key_notes, actionable_insights, "
            "topics, and skill content. Skills are auto-created with category 'youtube_knowledge'. "
            "Video knowledge is stored in RAG ChromaDB for future retrieval and shared via universal recursive link. "
            "The YouTubeSkillCreator tracks topics with Bayesian effectiveness scoring (same formula as MetaLearner: "
            "0.5 * bayesian_success + 0.3 * satisfaction + 0.2 * reuse). After 3+ videos on the same topic, "
            "creates pattern skills (category 'youtube_pattern'). After 5+ total videos, creates a meta-skill "
            "(category 'youtube_meta'). Analysis prompts are dynamically adjusted based on past feedback — "
            "emphasis styles (code_examples, step_by_step, pros_cons, key_concepts, general) and detail levels "
            "(concise, moderate, detailed) are selected per topic. If an emphasis style has low effectiveness "
            "and high correction rate, the system automatically tries a different style. JSONL export produces "
            "datasets directly loadable into HuggingFace datasets.Dataset for fine-tuning. All self-improvement "
            "runs post-turn via asyncio.create_task — zero-slowdown."
        ),
        "keywords": ["youtube", "video", "transcript", "whisper", "yt-dlp", "skill creation", "bayesian", "self-improving", "fine-tuning", "jsonl", "rag", "pattern skill", "meta skill"],
    },
    "plan_mode": {
        "name": "Plan Mode — Deep Planning System",
        "category": "ai_systems",
        "content": (
            "incllmv2's DeepPlanner generates structured JSON plans with phases, steps, dependencies, "
            "and risk assessment. Plans include 2-5 phases with 2-6 steps each. Each step has a title, "
            "description, tool specification, estimated time, and dependencies. Risk assessment includes "
            "description, mitigation strategy, and severity (low/medium/high). Success criteria define "
            "how to verify plan completion. Plans can be revised based on feedback. The PlanSkillCreator "
            "tracks project types with Bayesian effectiveness scoring (0.5 * bayesian_success + 0.3 * "
            "satisfaction + 0.2 * reuse). After 3+ plans, creates a planning meta-skill. Planning prompts "
            "are dynamically adjusted with learned insights per project type. All self-improvement runs "
            "post-turn via asyncio.create_task — zero-slowdown."
        ),
        "keywords": ["planning", "deep planner", "phases", "steps", "dependencies", "risk assessment", "autonomous", "execution plan", "self-improving", "bayesian"],
    },
    "autonomous_execution": {
        "name": "Autonomous Execution Engine",
        "category": "ai_systems",
        "content": (
            "incllmv2's ExecutionEngine autonomously executes plans with checkpointing, self-review, "
            "auto-retry, and auto-replan. Checkpoints save to disk after each step — execution can resume "
            "after crashes. Self-review: LLM reviews its own output after each step using a review prompt "
            "that checks if the output accomplishes the step requirements. Auto-retry: failed steps are "
            "retried up to max_retries (default 3) with failure context injected into the retry prompt. "
            "Auto-replan: if consecutive_failures exceeds max_consecutive_failures (default 5), the "
            "planner re-plans the failing phase. FileAgent provides secure file operations (create, read, "
            "update, delete, list, run_command) sandboxed to the workspace root with path traversal "
            "protection. Command execution is limited to an allowlist. Supports foreground (blocking) and "
            "background (asyncio.create_task) execution modes. Pause/resume/cancel supported. "
            "FreeServerSlotManager manages 10 RLOS slots (5 execution, 5 reserved) for execution support. "
            "ExecutionSkillCreator tracks execution patterns with Bayesian scoring and creates meta-skills "
            "after 10+ executions. All self-improvement runs post-turn — zero-slowdown."
        ),
        "keywords": ["execution", "autonomous", "checkpointing", "self-review", "auto-retry", "auto-replan", "file agent", "sandboxed", "free server slots", "background execution", "self-improving"],
    },
    "enhanced_tool_calling": {
        "name": "Enhanced Tool Calling System",
        "category": "ai_systems",
        "content": (
            "incllmv2's enhanced tool calling system supports Ollama native function calling with "
            "schema validation and parallel execution. ToolSchema and ToolParameter dataclasses define "
            "tools in Ollama-compatible JSON format with typed parameters (string, integer, number, "
            "boolean, array, object), required/optional flags, enum constraints, and default values. "
            "EnhancedToolRegistry manages tool registration, Ollama format export, argument validation, "
            "and parallel execution via asyncio.gather. 13 built-in tools: create_file, read_file, "
            "list_directory, run_command, execute_python, calculate, get_time, text_replace, text_split, "
            "text_join, json_parse, system_info, search_text. The enhanced_tool_loop tries native Ollama "
            "tool calls first (if bus supports complete_with_tools), falls back to [TOOL: name(args)] "
            "text parsing, executes independent calls in parallel, and feeds results back to the LLM. "
            "ToolSkillCreator tracks tool usage with Bayesian effectiveness scoring (0.6 * bayesian + "
            "0.4 * reuse) and creates tool meta-skills after 20+ calls. get_best_tools_for_task() "
            "recommends tools based on learned task-type effectiveness. All self-improvement runs "
            "post-turn via asyncio.create_task — zero-slowdown."
        ),
        "keywords": ["tool calling", "function calling", "ollama", "native", "schema", "parallel", "validation", "built-in tools", "self-improving", "bayesian", "tool selection"],
    },
    "self_evolving_system": {
        "name": "Self-Evolving Autonomous Goal System",
        "category": "ai_systems",
        "content": (
            "incllmv2's self-evolving system is an always-on autonomous improvement loop that continuously "
            "evaluates and improves its own capabilities. The BenchmarkTracker tracks 10 capability categories "
            "(reasoning, coding, planning, execution, tool_use, creativity, knowledge_recall, conversation, "
            "problem_solving, self_improvement) with EWMA (exponentially weighted moving average) scoring and "
            "Bayesian confidence intervals. Scores persist to SQLite. The SelfEvolver runs a continuous loop: "
            "evaluate → identify weak areas → web research → create improvement plan → execute → re-evaluate. "
            "Self-evaluation uses LLM to assess its own capabilities per category. Web research uses "
            "InternetIntegration to search for latest AI techniques. Improvement plans are created using the "
            "DeepPlanner and optionally executed by the ExecutionEngine. The EvolutionSkillCreator tracks "
            "which improvement strategies work best for which weak areas using Bayesian effectiveness scoring "
            "(0.6 * bayesian + 0.4 * reuse) and creates evolution meta-skills after 5+ cycles. "
            "get_best_strategies_for_category() recommends strategies based on learned effectiveness. "
            "Runs as a background asyncio task with configurable interval (default 3600s). Can be triggered "
            "manually via API. All self-improvement runs post-cycle — zero-slowdown."
        ),
        "keywords": ["self-evolving", "autonomous", "benchmark", "ewma", "self-evaluation", "web research", "improvement plan", "self-improving", "bayesian", "always-on", "capability tracking"],
    },
    "image_generation_vision": {
        "name": "Image Generation and Vision System",
        "category": "ai_systems",
        "content": (
            "incllmv2's image generation uses Pollinations.ai — a free, URL-based API that requires no API key "
            "and no GPU. Endpoint: https://image.pollinations.ai/prompt/{encoded_prompt}?width=W&height=H&model=M. "
            "Supported models: flux (default, best quality), flux-realism, flux-anime, flux-3d, any-dark, turbo. "
            "Images are downloaded and saved to disk. Batch generation supports parallel requests. "
            "Image understanding uses Ollama vision models: moondream2 (1.9B params, CPU-friendly, default) and "
            "llava (larger, fallback). Images are sent as base64-encoded data in the Ollama chat API 'images' field. "
            "Preset prompt types: describe, analyze, extract_text (OCR), identify_objects, count, summarize, "
            "code_from_image, diagram_explain. Auto-pulls models if not available. The VisionSkillCreator tracks "
            "vision analysis patterns with Bayesian effectiveness scoring (0.6 * bayesian + 0.4 * reuse) and creates "
            "vision meta-skills after 10+ analyses. get_best_prompt_for_category() recommends prompt types based on "
            "learned image category effectiveness. All self-improvement runs post-turn via asyncio.create_task — "
            "zero-slowdown. Works on CPU-only machines — no GPU required for either generation or understanding."
        ),
        "keywords": ["image generation", "pollinations", "vision", "moondream2", "llava", "ocr", "image understanding", "cpu-friendly", "free", "no gpu", "self-improving", "bayesian"],
    },
    "jarvis_gaming_connection": {
        "name": "Jarvis ↔ AI Gaming MPC Connection",
        "category": "ai_systems",
        "content": (
            "incllmv2's JarvisGamingBridge connects the Jarvis voice assistant to the AI Gaming MPC "
            "companion mode, enabling voice-driven interaction with the AI companion. Voice commands are "
            "classified as game commands (play game, start game, strategy, attack, defend, etc.) or "
            "companion chat (hello, how are you, what do you think, etc.). Game commands route through "
            "the AI Gaming MPC's process_companion_command with emotional state and personality context. "
            "Companion chat routes through companion_chat with voice_mode=True. All responses include "
            "TTS-ready text (markdown stripped) and emotional state metadata. The bridge tracks voice "
            "interaction stats: total interactions, game commands, companion chats, and emotional "
            "responses. Non-game/non-companion commands fall through to standard Jarvis processing. "
            "Zero-slowdown: all routing is O(n) keyword scan, async throughout."
        ),
        "keywords": ["jarvis", "gaming", "voice", "companion", "bridge", "emotional state", "tts", "game commands", "voice mode", "ai gaming mpc"],
    },
    "sub_harnesses": {
        "name": "Sub-Harness System",
        "category": "ai_systems",
        "content": (
            "incllmv2's sub-harness system provides modular workload isolation through SubHarnessManager. "
            "Each sub-harness wraps the main harness with its own memory, tool registry, channel profile, "
            "and resource limits. Default sub-harnesses: youtube, planning, execution, evolution, vision, "
            "image_gen, tools. Each has configurable max_concurrent_tasks, max_memory_items, and timeout. "
            "SubHarness.chat() routes through the parent harness with isolated memory context. "
            "run_background() executes coroutines with task tracking and concurrency limits. "
            "SubHarnessManager manages registration, routing, and stats aggregation across all sub-harnesses. "
            "API endpoints: GET /v1/sub-harness/stats, GET /v1/sub-harness/list. "
            "Zero-slowdown: all operations async, isolated from main chat pipeline."
        ),
        "keywords": ["sub-harness", "isolation", "workload", "modular", "channel", "concurrent", "background tasks", "resource limits"],
    },
}


def get_all_domains() -> list[dict[str, Any]]:
    """Return all domain seeds as a list."""
    return [
        {"id": domain_id, **domain_data}
        for domain_id, domain_data in DOMAINS.items()
    ]


def get_domain(domain_id: str) -> dict[str, Any] | None:
    """Get a specific domain by ID."""
    return DOMAINS.get(domain_id)


def search_domains(query: str, limit: int = 3) -> list[dict[str, Any]]:
    """Search domains by keyword match."""
    query_words = set(query.lower().split())
    scored: list[tuple[float, dict[str, Any]]] = []
    for domain_id, domain in DOMAINS.items():
        searchable = f"{domain_id} {domain['name']} {domain['category']} {' '.join(domain.get('keywords', []))}".lower()
        score = sum(1.0 for w in query_words if w in searchable)
        if score > 0:
            scored.append((score, {"id": domain_id, **domain}))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [d for _, d in scored[:limit]]
