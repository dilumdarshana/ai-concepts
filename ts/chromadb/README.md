# ChromaDB

Express server connecting to ChromaDB (Cloud or Docker) with OpenAI embeddings.

## Prerequisites

- Docker (for self-hosted mode)
- OpenAI API key
- Chroma Cloud API key (for Cloud mode — [sign up free](https://trychroma.com/signup))

## Setup

```sh
# From workspace root (ts/)
pnpm install

# Copy and configure environment
cp chromadb/.env_example chromadb/.env
# Edit .env with your keys
```

## Run

### Chroma Cloud (default)

```sh
pnpm dev:chromadb
```

The server connects to `api.trychroma.com` using `CHROMA_API_KEY`, `CHROMA_TENANT`, and `CHROMA_DATABASE` from `.env`.

### Docker / Self-hosted

1. Start ChromaDB:
   ```sh
   cd chromadb
   docker compose up -d
   ```

2. Comment out the `CloudClient` block and uncomment the `ChromaClient` block in `server.ts`.

3. Run:
   ```sh
   pnpm dev:chromadb
   ```

Server starts on `http://localhost:3000`.

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check + ChromaDB connection status |
| `POST` | `/collections` | Create a new collection (body: `{ name, metadata? }`) |
| `POST` | `/collections/:name/add` | Insert documents (body: `{ documents: [{ document, metadata }] }`) |
| `POST` | `/collections/:name/query` | Query collection (body: `{ query: string }`) |

## Testing

Use the included `test.rest` file with VS Code REST Client, or curl:

```sh
curl http://localhost:3000/health
```
