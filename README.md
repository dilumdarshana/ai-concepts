# AI Concepts

A pnpm workspace of TypeScript projects exploring AI/LLM patterns — LangChain, LangGraph, RAG, vector stores, MCP, and more.

All projects live under [`ts/`](ts/) and are managed from the workspace root.

## Projects

| Project | Stack | What it does |
|---|---|---|
| [langchain](ts/langchain/) | Express, LangChain | Chat with in-memory session history |
| [langgraph](ts/langgraph/) | Express, LangGraph, Prisma/PostgreSQL | Agent with tools, memory, and DB |
| [chromadb](ts/chromadb/) | Express, ChromaDB (Cloud/Docker) | Vector store with OpenAI embeddings |
| [rag-json](ts/rag-json/) | Next.js 15, AI SDK v6, LangChain | 4 chat endpoints with increasing RAG complexity |
| [rag-huggingface](ts/rag-huggingface/) | Express, Pinecone, HuggingFace | RAG with free embedding model |
| [rag-redis](ts/rag-redis/) | Express, Redis/RediSearch | RAG with Redis vector DB |
| [mcp](ts/mcp/) | Express, LangGraph MCP adapters | MCP client connecting to subprocess servers |
| [mcp-server-mongo](ts/mcp-server-mongo/) | MCP SDK, MongoDB | MCP server for MongoDB queries |
| [voltagent](ts/voltagent/) | VoltAgent, GitHub API | Supervisor + sub-agents for repo analysis |

## Prerequisites

- **Node.js** 20+ (see `.nvmrc` in `ts/`)
- **pnpm** 11.5+
- **OpenAI API key** (most projects)
- **Docker** (chromadb, rag-redis)

## Quick Start

```sh
cd ts
pnpm install
# Copy .env_example to .env for the project you want to run
pnpm dev:<project>
```

See each project's README for detailed setup.
