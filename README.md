# AI Concepts

A workspace of AI/LLM projects in **TypeScript** (`ts/`) and **Python** (`python/`) — LangChain, LangGraph, RAG, vector stores, MCP, and more.

📚 **Concept docs**: see [`docs/README.md`](docs/README.md) — the knowledge base index covering RAG, vector search, agents, MCP, and production.

## Languages

| Language   | Root                 | Project layout                                              |
| ---------- | -------------------- | ----------------------------------------------------------- |
| TypeScript | [`ts/`](ts/)         | pnpm workspace                                              |
| Python     | [`python/`](python/) | uv per-project — see [`python/README.md`](python/README.md) |

## Projects

| Project             | Stack (TypeScript)                                          | Stack (Python)                                   | What it does                                                              |
| ------------------- | ----------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------- |
| langchain           | [ts](ts/langchain/) · Express, LangChain, LangGraph, Langfuse | [python](python/langchain/) · FastAPI, LangChain | 10 route-per-concept demos: prompts, LCEL, streaming, tools, memory       |
| langgraph           | [ts](ts/langgraph/) · Express, LangGraph, Prisma/PostgreSQL | —                                                | Agent with tools, memory, and DB                                          |
| chromadb            | [ts](ts/chromadb/) · Express, ChromaDB                      | —                                                | Vector store with OpenAI embeddings                                       |
| rag-json            | [ts](ts/rag-json/) · Next.js 15, AI SDK v6, LangChain       | —                                                | 4 chat endpoints with increasing RAG complexity                           |
| rag-huggingface     | [ts](ts/rag-huggingface/) · Express, Pinecone, HuggingFace  | —                                                | RAG with free embedding model                                             |
| rag-redis           | [ts](ts/rag-redis/) · Express, Redis/RediSearch             | —                                                | RAG with Redis vector DB                                                  |
| rag-hybrid          | [ts](ts/rag-hybrid/) · Express, ChromaDB                    | —                                                | Hybrid retrieval: dense + BM25 + RRF + reranking                          |
| rag-hybrid-qdrant   | [ts](ts/rag-hybrid-qdrant/) · Express, Qdrant               | —                                                | Qdrant hybrid retrieval: content-aware chunking + dense/BM25 + native RRF |
| rag-graph           | [ts](ts/rag-graph/) · Express, Neo4j, LangChain             | —                                                | GraphRAG — knowledge graph + hybrid vector/graph retrieval                |
| mcp-client          | [ts](ts/mcp-client/) · Express, LangGraph MCP adapters      | —                                                | MCP client connecting to subprocess servers                               |
| mcp-server-mongo    | [ts](ts/mcp-server-mongo/) · MCP SDK v1, MongoDB            | —                                                | MCP server for MongoDB queries                                            |
| mcp-server-mongo-v2 | [ts](ts/mcp-server-mongo-v2/) · MCP Server v2, MongoDB      | —                                                | MCP server for MongoDB queries (v2 SDK)                                   |
| voltagent           | [ts](ts/voltagent/) · VoltAgent, GitHub API                 | —                                                | Supervisor + sub-agents for repo analysis                                 |

## Prerequisites

- **Node.js** 20+ (see `.nvmrc` in `ts/`)
- **pnpm** 11.5+ (TS projects)
- **Python** 3.12+, **uv** (Python projects)
- **OpenAI API key** (most projects)
- **Docker** (chromadb, rag-redis, rag-graph, rag-hybrid, rag-hybrid-qdrant)

## Quick Start

**TypeScript:**

```sh
cd ts
pnpm install
# Copy .env_example to .env for the project you want to run
pnpm dev:<project>
```

**Python:**

```sh
cd python/langchain
cp .env_example .env
uv sync
uv run uvicorn langchain_python.main:app --reload --port 3000
```

See each project's README for detailed setup.
