# GraphRAG with Neo4j

A knowledge-graph RAG demo. Documents are chunked, then an LLM extracts entities and relationships which are stored as a graph in Neo4j alongside vector embeddings. Queries are answered via **hybrid retrieval**: vector similarity finds the most relevant chunks, then graph traversal expands to neighbouring entities and their chunks.

> Want the *why* behind the design? See [**CONCEPTS.md**](CONCEPTS.md) — diagrams of the graph model, ingestion, and hybrid retrieval.

## Setup

```sh
docker compose up -d          # start Neo4j (bolt://localhost:7687, neo4j/password)
cp .env_example .env          # add OPENAI_API_KEY
pnpm dev:rag-graph            # from workspace root
```

## Flow

1. **Ingest** — `POST /ingest-sample` (or `/ingest` with your own text). Each document is split into sentences, embedded, and the LLM extracts entities (`Person`, `Company`, `Technology`, ...) and relationships into the graph.
2. **Retrieve** — `POST /query`. The query is embedded and matched against chunks (vector KNN), then the graph is expanded 1-2 hops from the entities those chunks mention.
3. **Answer** — `POST /chat`. The combined context (vector + graph hits) is fed to the LLM.

## Why graph + vector?

Pure vector RAG only finds chunks that are *textually similar* to the query. Graph expansion finds chunks that are *related by entity* — e.g. "Which technologies does Tom Okafor work with?" matches Tom's chunk via vector search, then follows his `RELATES_TO` edges to the technologies he works with, even if no single chunk contains the full answer.

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Neo4j connectivity check |
| POST | `/ingest` | Ingest `{ text, source }` into the graph |
| POST | `/ingest-sample` | Ingest bundled `data/sample.json` |
| POST | `/query` | Hybrid retrieval, returns context chunks |
| POST | `/chat` | Hybrid retrieval + LLM answer |
| GET | `/graph` | Node/relationship counts |
| POST | `/clear` | Wipe all graph data |

## Graph model

```
(:Chunk {id, text, source, embedding})
(:Entity {name, type})
(:Chunk)-[:MENTIONS]->(:Entity)
(:Entity)-[:RELATES_TO {type}]->(:Entity)
```

Browse the graph in the Neo4j Browser at http://localhost:7474 (neo4j / password).