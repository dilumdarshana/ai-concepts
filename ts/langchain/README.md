# LangChain

Express chat server with in-memory session history using LangChain.

## Prerequisites

- OpenAI API key

## Setup

```sh
# From workspace root (ts/)
pnpm install

# Copy and configure environment
cp langchain/.env_example langchain/.env
# Edit .env with your OPENAI_API_KEY
```

## Run

```sh
pnpm dev:langchain
```

Server starts on `http://localhost:3000`.

## API

### POST /chat

```sh
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello!"}'
```

Returns `{ "response": { "answer": "...", "confidence": 0.95 } }`.

The server uses a fixed session ID (`"assistant"`) with in-memory history — conversation resets on restart.

## Features

- **Prompt templates** with `{skill}` variable (defaults to `"nodejs"`)
- **In-memory chat history** via `InMemoryChatMessageHistory`
- **Streaming** responses from `ChatOpenAI`

## Testing

Use `test.rest` (VS Code REST Client) or curl to test conversation with memory.
