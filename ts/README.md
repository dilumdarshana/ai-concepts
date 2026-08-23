# AI Concepts — Workspace

This directory is the pnpm workspace root for all AI/LLM concept projects.

## Commands

```sh
pnpm install                   # install all workspace dependencies
pnpm dev:<project>             # run any project's dev script
pnpm add <pkg> --filter <name> # add dependency to a specific project
```

## Projects

| Command | Project | Framework | Description |
|---|---|---|---|
| `pnpm dev:langchain` | [langchain](langchain/) | Express | 10 route-per-concept demos: prompts, LCEL, streaming, tools, memory |
| `pnpm dev:langgraph` | [langgraph](langgraph/) | Express | LangGraph agent with 3 tools + Prisma/PostgreSQL memory |
| `pnpm dev:chromadb` | [chromadb](chromadb/) | Express | ChromaDB vector store (Cloud or Docker) with OpenAI embeddings |
| `pnpm dev:rag` | [rag-json](rag-json/) | Next.js 15 | 4 chat API routes: basic → LangChain → personalized → RAG with JSONLoader |
| `pnpm dev:rag-huggingface` | [rag-huggingface](rag-huggingface/) | Express | Pinecone + HuggingFace embeddings (free model) |
| `pnpm dev:rag-redis` | [rag-redis](rag-redis/) | Express | Redis/RediSearch as vector DB for movie data |
| `pnpm dev:rag-graph` | [rag-graph](rag-graph/) | Express | Neo4j GraphRAG — knowledge graph + hybrid vector/graph retrieval |
| `pnpm dev:rag-hybrid` | [rag-hybrid](rag-hybrid/) | Express | Hybrid retrieval: dense + BM25 + RRF + reranking |
| `pnpm dev:mcp-client` | [mcp-client](mcp-client/) | Express | MCP client connecting to subprocess MCP servers via LangGraph |
| `pnpm dev:server-mongo` | [mcp-server-mongo](mcp-server-mongo/) | MCP SDK | MCP server (stdio) for MongoDB queries |
| `pnpm dev:server-mongo-v2` | [mcp-server-mongo-v2](mcp-server-mongo-v2/) | MCP Server v2 | MCP server for MongoDB queries (v2 SDK) |
| `pnpm dev:voltagent` | [voltagent](voltagent/) | VoltAgent | Supervisor + sub-agents for GitHub repo analysis |

## Prerequisites

- **Node.js** 20+ (`.nvmrc`)
- **pnpm** 11.5+
- **OpenAI API key** (most projects)
- **Docker** (chromadb: ChromaDB container; rag-redis: Redis with RediSearch)

## Setup

```sh
pnpm install
# Copy .env_example → .env for the project you want to run, then add your API keys
pnpm dev:<project>
```

Each project has its own `AGENTS.md` and `README.md` with detailed instructions.
