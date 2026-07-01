# mcp-client

Multi-server MCP client exposing a LangGraph React agent over HTTP.

- `pnpm dev:mcp-client` from workspace root
- Express on port 3000 — POST /chat
- Uses `MultiServerMCPClient` from `@langchain/mcp-adapters`
- Connects to 3 MCP servers: filesystem, mongodb (pnpx), currencyConverter (pnpx)
- Creates a LangGraph React agent from discovered MCP tools
- `test.rest` for manual API testing with multiple example prompts
- `.env` needs `OPENAI_API_KEY`, `MONGODB_URL`, `FREE_CURRENCY_KEY`
