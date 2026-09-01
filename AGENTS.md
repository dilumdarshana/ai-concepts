# AI Concepts

pnpm workspace at `ts/` — Node 24.15 (.nvmrc), pnpm 11.5.2.

## Commands

```sh
cd ts && pnpm install          # install all workspace dependencies
pnpm dev:<name>                # run any project's dev script
pnpm format                    # format all projects with Prettier (single quotes)
pnpm format:check              # check formatting without writing
```

## Projects

| Command | Project | What it is |
|---|---|---|
| `pnpm dev:langchain` | `ts/langchain/` | Express chat with in-memory session history |
| `pnpm dev:chromadb` | `ts/chromadb/` | Express + ChromaDB vector store (requires Docker) |
| `pnpm dev:rag` | `ts/rag-json/` | Next.js 15 RAG app with JSON data (Turbopack) |
| `pnpm dev:rag-huggingface` | `ts/rag-huggingface/` | Express + Pinecone + HuggingFace embeddings |
| `pnpm dev:langgraph` | `ts/langgraph/` | Express + LangGraph agent + Prisma/PostgreSQL |
| `pnpm dev:mcp-client` | `ts/mcp-client/` | MCP client connecting to subprocess MCP servers |
| `pnpm dev:rag-redis` | `ts/rag-redis/` | Express + Redis/RediSearch vector DB |
| `pnpm dev:rag-graph` | `ts/rag-graph/` | Express + Neo4j GraphRAG (requires Docker) |
| `pnpm dev:rag-hybrid` | `ts/rag-hybrid/` | Express + ChromaDB hybrid retrieval: dense + BM25 + RRF + reranking (requires Docker) |
| `pnpm dev:rag-hybrid-qdrant` | `ts/rag-hybrid-qdrant/` | Express + Qdrant hybrid retrieval: content-aware chunking + dense/BM25 + native RRF (requires Docker) |
| `pnpm dev:voltagent` | `ts/voltagent/` | VoltAgent app with Biome lint + typecheck |
| — | `ts/mcp-server-mongo/` | MCP server (stdio) for MongoDB (requires build) |

## Commit conventions

All commits **must** follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add MCP server support
feat(agent): add MCP tool integration
fix: handle null in currency conversion
chore(deps): upgrade langchain to v0.3.50
docs: update README with MCP examples
refactor: extract database tool into separate file
```

A `commit-msg` git hook enforces this via `commitlint` (config: `ts/commitlint.config.cjs`). If the hook blocks your commit, fix the message — not the hook.

No CI/CD, no unit tests. Most projects have a `test.rest` file for manual HTTP testing.
