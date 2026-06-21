# LangChain

- LangChain is a framework for develop applications powered by LLMs

## Main building blocks
- Prompt Templates: can use parametrised templates which automatically inject to context
- Chains: sequence of steps
- Tools: to fetch external information
- RAG: to retrieve knowledge from vectors

## What LangChain can do
- Load and split documents - file and directory loaders, text splitters (see the loaders and chunking post); PDF, HTML, CSV via integration packages
- Embeddings and vector stores - OpenAI embeddings with pgvector, Pinecone, Chroma, and others
- Retrievers and RAG chains - fetch relevant context, then call a model
- Conversation memory - short-term memory via @langchain/langgraph checkpointers and thread_id, long-term memory via stores
- Tools and agents - createAgent with tools and middleware; for production agents you may also prefer the Vercel AI SDK agents post or OpenAI Agents SDK post
- Structured output - Zod schemas via .withStructuredOutput() on a chat model or responseFormat on createAgent; read parsed objects from the chain result or result.structuredResponse
- Observability - trace runs with LangSmith (LANGSMITH_TRACING=true); optional LangSmith Engine monitors traces and flags issues

## Main libararies
- langchain: Chains, agents and retrival stratergies
- @langchain/core: contains the core abstractions and schemas of LangChain.js, including base classes for language models, chat models, vectorstores, retrievers, and runnables.
- @langchain/community: 3rd party integrations, document loaders, etc...

- @langchain/langgraph: when agent needs memory, branching logic, retries and complex flow

## Sub packages
- @langchain/openai
- @langchain/anthropic
- @langchain/mistralai

## How to run and test

```sh
# 1. Copy environment file and add your OpenAI key
cp .env_example .env
# Edit .env with your OPENAI_API_KEY

# 2. Install dependencies (from workspace root)
cd .. && pnpm install && cd langchain

# 3. Start the server
pnpm dev:langchain
# Server starts on http://localhost:3000

# 4. Test with curl or VS Code REST Client
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is my name?"}'
# Response: { "response": { "answer": "...", "confidence": 0.95 } }

# 5. Test with memory
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "My name is Dilum?"}'

curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is my name?"}'
# Response: { "response": { "answer": "Your name is Dilum", "confidence": 0.95 } }
```

## Migration notes

This project was migrated from the deprecated `RunnableWithMessageHistory` pattern to
LangGraph's `StateGraph` + `MemorySaver` checkpointer.

| Old (deprecated) | New |
|---|---|
| `RunnableWithMessageHistory` | `StateGraph` + checkpointer |
| `sessionId` | `thread_id` (in `configurable`) |
| `InMemoryChatMessageHistory` | `MemorySaver` (swap for `SqliteSaver`/`PostgresSaver` in prod) |

See inline comments in `chat.ts` for the full migration pattern.