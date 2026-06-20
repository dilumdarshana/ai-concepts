# rag-huggingface

Express + Pinecone + HuggingFace embeddings.

- `pnpm dev:rag-huggingface` from workspace root
- Express on port 3000 — endpoints: POST /create-index, /embeddings, /query, /chat
- Pinecone serverless vector DB (AWS us-east-1), returns metadata only (no vectors)
- HuggingFace embedding model: `sentence-transformers/all-MiniLM-L12-v2` (384 dimensions)
- Chat uses OpenAI GPT-4o via LangChain `RunnableSequence`
- `test.rest` for manual API testing
- `.env` needs `OPENAI_API_KEY`, `PINECONE_API_KEY`, `HF_TOKEN`
