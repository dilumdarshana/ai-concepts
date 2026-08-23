# LangChain (Python)

A FastAPI app that demos the major LangChain concepts — one route per concept, mirroring the TypeScript [`ts/langchain`](../../ts/langchain) project 1:1. Doubles as a reference for future projects.

## Prerequisites

- Python 3.12+
- [uv](https://docs.astral.sh/uv/) for dependency management
- OpenAI API key

## Setup

```sh
cd python/langchain
cp .env_example .env    # add your OPENAI_API_KEY
uv sync                 # create .venv and install deps
```

## Run

```sh
uv run uvicorn langchain_python.main:app --reload --port 3000
```

Server starts on `http://localhost:3000`. Interactive API docs at `http://localhost:3000/docs` (OpenAPI). `GET /` lists all concept routes.

## Concept routes

Each route demonstrates exactly one LangChain concept:

| Route | Concept | What you'll see |
|---|---|---|
| `GET /` | index | List of all routes |
| `/messages` | Message roles | `SystemMessage`/`HumanMessage`, role boundaries |
| `/prompt` | `PromptTemplate` | string prompt with `{variable}` placeholders |
| `/chat-prompt` | `ChatPromptTemplate` | role-tagged messages + `MessagesPlaceholder` |
| `/structured` | `with_structured_output` | Pydantic-model-typed output |
| `/chain` | LCEL | `prompt \| model \| parser` |
| `/lc` | Runnable primitives | `RunnablePassthrough.assign` + `RunnableLambda` |
| `/stream` | Streaming | token-by-token plain-text stream |
| `/tools` | Tool calling | `@tool` + `bind_tools` + `ToolMessage` loop |
| `/memory` | LangGraph | `StateGraph` + `MemorySaver` (persistent `thread_id`) |
| `/trim` | Message trimming | `trim_messages` bounds a growing history |

### Examples

```sh
# Tool calling — the model decides to call `multiply`
curl -X POST localhost:3000/tools -H "Content-Type: application/json" \
  -d '{"message":"What is 7 times 8?"}'

# Streaming (plain-text tokens)
curl -N -X POST localhost:3000/stream -H "Content-Type: application/json" \
  -d '{"message":"Count 1 to 5"}'

# Memory — same thread_id recalls prior turns
curl -X POST localhost:3000/memory -H "Content-Type: application/json" \
  -d '{"message":"My name is Dilum","thread_id":"demo"}'
curl -X POST localhost:3000/memory -H "Content-Type: application/json" \
  -d '{"message":"What is my name?","thread_id":"demo"}'
```

## Testing

Use `test.http` (VS Code REST Client) or curl to test each route. Routes that call OpenAI need a valid `OPENAI_API_KEY` in `.env`.

> This project intentionally mirrors `ts/langchain` so concepts can be compared across languages. See `CONCEPTS.md` for explanations.
