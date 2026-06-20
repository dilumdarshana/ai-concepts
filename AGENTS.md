# AI Concepts

pnpm workspace at `ts/` — Node 24.15 (.nvmrc), pnpm 10.7.0.

## Commands

```sh
cd ts && pnpm install          # install all workspace dependencies
pnpm dev:<name>                # run any project's dev script
```

## Projects

| Command | Project | What it is |
|---|---|---|
| `pnpm dev:langchain` | `ts/langchain/` | Express chat with in-memory session history |
| `pnpm dev:chromadb` | `ts/chromadb/` | Express + ChromaDB vector store (requires Docker) |
| `pnpm dev:rag` | `ts/rag-json/` | Next.js 15 RAG app with JSON data (Turbopack) |
| `pnpm dev:rag-huggingface` | `ts/rag-huggingface/` | Express + Pinecone + HuggingFace embeddings |
| `pnpm dev:langgraph` | `ts/langgraph/` | Express + LangGraph agent + Prisma/PostgreSQL |
| `pnpm dev:mcp` | `ts/mcp/` | MCP client connecting to subprocess MCP servers |
| `pnpm dev:rag-redis` | `ts/rag-redis/` | Express + Redis/RediSearch vector DB |
| `pnpm dev:voltagent` | `ts/voltagent/` | VoltAgent app with Biome lint + typecheck |
| — | `ts/mcp-server-mongo/` | MCP server (stdio) for MongoDB (requires build) |

No CI/CD, no unit tests. Most projects have a `test.rest` file for manual HTTP testing.
