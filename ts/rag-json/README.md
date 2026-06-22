# RAG JSON

Next.js 15 RAG app demonstrating 4 progressively complex chat API routes using the AI SDK v6 and LangChain.

## Tech Stack

- **Framework**: Next.js 15 (Turbopack) with React 19
- **AI**: `ai` v6 + `@ai-sdk/openai` + `@ai-sdk/react`
- **LangChain**: `@langchain/openai`, `@langchain/core`, `langchain`
- **Styling**: Tailwind CSS v4 with PostCSS
- **Data Source**: `data/movie.json`

## Prerequisites

- Node.js 20+ (`.nvmrc` at workspace root)
- `pnpm` 11.5+
- OpenAI API key

## Setup

```sh
# From workspace root (ts/)
pnpm install

# Copy and configure environment
cp rag-json/.env.local_example rag-json/.env.local
# Edit .env.local with your OPENAI_API_KEY
```

## Run

```sh
pnpm dev:rag
```

Opens at [http://localhost:3000](http://localhost:3000).

## Chat Endpoints

All routes accept `POST` with `{ "messages": UIMessage[] }` and stream responses in AI SDK v6 SSE format.

| Route | Description |
|---|---|
| `/api/chat` | **Basic** — `streamText` from AI SDK v6 via `@ai-sdk/openai` |
| `/api/chat2` | **LangChain** — `ChatOpenAI` + `StringOutputParser`, simple prompt |
| `/api/chat3` | **Personalized** — `ChatPromptTemplate` + `MessagesPlaceholder`, movie-expert persona |
| `/api/chat4` | **RAG** — `JSONLoader` loads `data/movie.json` as context via `RunnableSequence` |

The UI at `/` uses `useChat` from `@ai-sdk/react` pointing to `/api/chat`.

## Data Source

`data/movie.json` — JSON file with movie entries (title, genre, actors, year). Used by `/api/chat4`.

## Lint

```sh
pnpm lint
```
