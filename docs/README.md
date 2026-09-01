# AI Concepts — Knowledge Base

Concept overviews for everything in this workspace: RAG, vector search, agents, MCP, and how to take it all to production. Each doc is self-contained and cross-linked; diagrams are [Mermaid](https://mermaid.js.org/) and render on GitHub.

## Suggested reading order

1. [`llm-fundamentals.md`](llm-fundamentals.md) — the base layer: tokens, context window, temperature, messages.
2. [`introduction-to-rag.md`](introduction-to-rag.md) — what RAG is, the pipeline, and a map of all projects.
3. [`langchain-fundamentals.md`](langchain-fundamentals.md) — the building blocks (prompts, chains, LCEL) every project uses.
4. [`prompt-engineering.md`](prompt-engineering.md) — the craft: role, grounding, delimiters, structured output.
5. [`vector-search.md`](vector-search.md) — the deep dive on retrieval: embeddings, ANN, hybrid search, reranking.
6. [`document-processing.md`](document-processing.md) — the other half: chunking, metadata, and where embeddings live.
7. [`advanced-rag.md`](advanced-rag.md) — pushing retrieval further: query transformation, RAG-Fusion, self/corrective RAG.
8. [`ai-agents.md`](ai-agents.md) — ReAct, tool calling, and memory.
9. [`what-is-mcp.md`](what-is-mcp.md) — the protocol for connecting tools and data to agents.
10. [`langchain-vs-langgraph.md`](langchain-vs-langgraph.md) — chains vs stateful graphs, and when to use each.
11. [`multi-agent-orchestration.md`](multi-agent-orchestration.md) — supervisor + sub-agents and workflows.
12. [`production-rag.md`](production-rag.md) — evaluation, observability, guardrails: shipping it for real.
13. [`rag-troubleshooting.md`](rag-troubleshooting.md) — the diagnostic playbook: finding the failing seam, multi-hop, scaling.

## Find a concept

| I want to understand… | Read |
|---|---|
| Tokens, context window, temperature | `llm-fundamentals.md` |
| Writing better prompts | `prompt-engineering.md` |
| What RAG is and its pipeline | `introduction-to-rag.md` |
| Embeddings, cosine, ANN, HNSW | `vector-search.md` §2–7 |
| Chunking strategies | `vector-search.md` §8 · `document-processing.md` §2 |
| Structure-aware chunking | `document-processing.md` §2 |
| Creating metadata at ingest | `document-processing.md` §3 |
| Query transformation, RAG-Fusion | `advanced-rag.md` §2 |
| Adaptive / self / corrective RAG | `advanced-rag.md` §3 |
| Embeddings in Postgres (pgvector) | `document-processing.md` §4 |
| Hybrid search + RRF | `vector-search.md` §6 |
| Reranking (cross-encoder) | `vector-search.md` §9 |
| GraphRAG / knowledge graphs | `ts/rag-graph/CONCEPTS.md` |
| AI agents, ReAct, tool calling | `ai-agents.md` |
| LangChain vs LangGraph (chains vs graphs) | `langchain-vs-langgraph.md` |
| Prompt templates, LCEL, streaming | `langchain-fundamentals.md` |
| MCP tools/resources/prompts | `what-is-mcp.md` |
| Multiple agents / supervisor | `multi-agent-orchestration.md` |
| Evaluation, caching, guardrails | `production-rag.md` |
| Diagnosing RAG failures / bad answers | `rag-troubleshooting.md` |
| Multi-hop answers across documents | `rag-troubleshooting.md` §5 · `ts/rag-graph/CONCEPTS.md` |
| Scaling RAG to millions of docs | `rag-troubleshooting.md` §6 |

## Find a project

| Project | Concept doc | Deeper read |
|---|---|---|
| `langchain` | `langchain-fundamentals.md`, `ai-agents.md` §6 | `ts/langchain/README.md` |
| `langgraph` | `ai-agents.md` | `ts/langgraph/CONCEPTS.md` |
| `chromadb` | `vector-search.md` | `ts/chromadb/CONCEPTS.md` |
| `rag-json` | `introduction-to-rag.md`, `langchain-fundamentals.md` | `ts/rag-json/AGENTS.md` |
| `rag-huggingface` | `vector-search.md` §2 | `ts/rag-huggingface/README.md` |
| `rag-redis` | `vector-search.md` | `ts/rag-redis/README.md` |
| `rag-graph` | `introduction-to-rag.md`, `document-processing.md` §3 | `ts/rag-graph/CONCEPTS.md` |
| `rag-hybrid` | `vector-search.md` §6–9 | `ts/rag-hybrid/CONCEPTS.md` |
| `rag-hybrid-qdrant` | `vector-search.md` §6, `document-processing.md` §2 | `ts/rag-hybrid-qdrant/CONCEPTS.md` |
| `mcp-client` | `what-is-mcp.md`, `ai-agents.md` §7 | `ts/mcp-client/README.md` |
| `mcp-server-mongo` | `what-is-mcp.md` | `ts/mcp-server-mongo/README.md` |
| `voltagent` | `multi-agent-orchestration.md` | `ts/voltagent/AGENTS.md` |

## Quick map: concept → projects

| Concept | Project(s) |
|---|---|
| Chunking, prompt templates, session history | `langchain`, `rag-json` |
| Embeddings & vector stores | `chromadb`, `rag-huggingface`, `rag-redis`, `rag-graph` |
| RAG pipeline (4 levels) | `rag-json` |
| Hybrid retrieval (dense + BM25 + RRF + rerank) | `rag-hybrid` |
| Hybrid retrieval (Qdrant, native RRF) + content-aware chunking | `rag-hybrid-qdrant` |
| Advanced retrieval (query transform, self/corrective RAG) | conceptual only — see `advanced-rag.md` |
| Failure diagnosis, multi-hop, scaling | conceptual — see `rag-troubleshooting.md` |
| GraphRAG & knowledge graphs | `rag-graph` |
| Agents (ReAct loop) | `langgraph`, `mcp-client` |
| MCP client/server | `mcp-client`, `mcp-server-mongo` |
| Multi-agent orchestration | `voltagent` |
