# rag-json

Next.js 15 RAG app demonstrating 4 progressively complex chat API routes using the AI SDK v6 and LangChain.

## Tech Stack

- **Framework**: Next.js 15 (Turbopack) with React 19
- **AI**: `ai` v6 + `@ai-sdk/openai` + `@ai-sdk/react`
- **LangChain**: `@langchain/openai`, `@langchain/core`, `langchain`
- **Styling**: Tailwind CSS v4 with PostCSS
- **Data Source**: `data/movie.json`

## Prerequisites

- Node.js 20+ (see `.nvmrc` at workspace root)
- `pnpm` 11.5+
- OpenAI API key

## Setup

```sh
# From the workspace root (ts/)
pnpm install

# Copy environment config
cp ts/rag-json/.env.local_example ts/rag-json/.env.local
# Edit .env.local and set your OPENAI_API_KEY
```

## Run

```sh
# From ts/ (workspace root)
pnpm dev:rag
```

Opens at [http://localhost:3000](http://localhost:3000).

## Chat Endpoints

All routes accept `POST` with `{ "messages": UIMessage[] }` and stream
responses in the AI SDK v6 SSE format (`text/event-stream`).

| Route | Description |
|---|---|
| `/api/chat` | **Basic** — `streamText` from AI SDK v6 via `@ai-sdk/openai` |
| `/api/chat2` | **LangChain** — `ChatOpenAI` + `StringOutputParser`, simple prompt |
| `/api/chat3` | **Personalized** — `ChatPromptTemplate` with `MessagesPlaceholder`, movie-expert persona |
| `/api/chat4` | **RAG** — `JSONLoader` loads `data/movie.json` as context, `RunnableSequence` injects it into prompt |

The UI at `/` uses `useChat` from `@ai-sdk/react` pointing to `/api/chat`.

## Data Source

`data/movie.json` — JSON file with movie entries (title, genre, actors, year).
Used by the `/api/chat4` RAG endpoint via `JSONLoader`.

## Lint

```sh
pnpm lint
```
