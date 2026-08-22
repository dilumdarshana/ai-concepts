# LangChain

Express server that demos the major LangChain concepts — one route per concept, so it doubles as a reference for future projects.

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

Server starts on `http://localhost:3000`. `GET /` lists all concept routes.

## Concept routes

Each route demonstrates exactly one LangChain concept:

| Route | Concept | What you'll see |
|---|---|---|
| `GET /` | index | List of all routes |
| `/messages` | Message roles | `SystemMessage`/`HumanMessage`, role boundaries |
| `/prompt` | `PromptTemplate` | string prompt with `{variable}` placeholders |
| `/chat-prompt` | `ChatPromptTemplate` | role-tagged messages + `MessagesPlaceholder` |
| `/structured` | `withStructuredOutput` | Zod-schema-typed model output |
| `/chain` | LCEL | `prompt.pipe(model).pipe(parser)` + `RunnableSequence` |
| `/lc` | Runnable primitives | `RunnablePassthrough.assign` + `RunnableLambda` |
| `/stream` | Streaming | token-by-token plain-text stream (`res.write`) |
| `/tools` | Tool calling | `@tool` + `bindTools` + `ToolMessage` loop |
| `/memory` | LangGraph | `StateGraph` + `MemorySaver` (persistent `thread_id`) |
| `/trim` | Message trimming | `trimMessages` bounds a growing history |

### Examples

```sh
# Prompt variable
curl -X POST localhost:3000/prompt -H "Content-Type: application/json" \
  -d '{"topic":"RAG","audience":"beginners"}'

# Streaming (plain-text tokens)
curl -N -X POST localhost:3000/stream -H "Content-Type: application/json" \
  -d '{"message":"Count 1 to 5"}'

# Tool calling — the model decides to call `multiply`
curl -X POST localhost:3000/tools -H "Content-Type: application/json" \
  -d '{"message":"What is 7 times 8?"}'

# Memory — same thread_id recalls prior turns
curl -X POST localhost:3000/memory -H "Content-Type: application/json" \
  -d '{"message":"My name is Dilum"}'
curl -X POST localhost:3000/memory -H "Content-Type: application/json" \
  -d '{"message":"What is my name?"}'
```

## Testing

Use `test.rest` (VS Code REST Client) or curl to test each route. Routes that call OpenAI need a valid `OPENAI_API_KEY` in `.env`.
