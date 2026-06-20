# mcp

MCP client connecting to subprocess MCP servers.

- `pnpm dev:mcp` from workspace root
- Express on port 3000 — POST /chat
- This is an MCP **client** (not server), uses `MultiServerMCPClient` from `@langchain/mcp-adapters`
- Connects to `mcp-server-mongo` (local sibling project) via subprocess
- Creates a LangGraph React agent from discovered MCP tools
- `test.rest` for manual API testing
- `.env` needs `OPENAI_API_KEY`
