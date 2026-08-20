# rag-graph

Express + Neo4j GraphRAG — knowledge-graph RAG with hybrid retrieval.

- `pnpm dev:rag-graph` from workspace root
- Requires Docker: `docker compose up -d` (runs `neo4j:5.26` on ports 7474/7687)
- Express on port 6000 — endpoints: GET /health, POST /ingest, POST /ingest-sample, POST /query, POST /chat, GET /graph, POST /clear
- Graph model: `(:Chunk)` nodes with OpenAI embeddings (`text-embedding-3-small`, 1536 dims) + `(:Entity)` nodes linked by `(:RELATES_TO)` relationships; chunks `MENTIONS` entities
- Ingestion: sentence-based chunking → LLM (`gpt-4o-mini`) extracts entities/relationships via Zod structured output → written to Neo4j
- Retrieval: hybrid — vector KNN on `chunk_embeddings` index, then 1-2 hop graph expansion from matched entities to pull neighbouring chunks
- Sample data: `data/sample.json` (fictional company "Nimbus Labs")
- `test.rest` for manual API testing
- `.env` needs `OPENAI_API_KEY`, `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` (defaults match docker-compose)