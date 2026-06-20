# langchain

Express chat with in-memory session history.

- `pnpm dev:langchain` from workspace root
- Express POST /chat on port 3000
- In-memory `ChatMessageHistory` with fixed session ID `"assistant"` — history resets on restart
- Prompt template includes `{skill}` variable (defaults to `"nodejs"`)
- `test.rest` for manual API testing
- `.env` needs `OPENAI_API_KEY`
