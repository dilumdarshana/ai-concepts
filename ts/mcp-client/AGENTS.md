# mcp-client

Multi-server MCP client exposing a LangGraph React agent over HTTP.

- `pnpm dev:mcp-client` from workspace root
- Express on port 3000 — `GET /` lists the service, `POST /chat` runs the agent
- Uses `MultiServerMCPClient` from `@langchain/mcp-adapters`
- Connects to MCP servers (all pinned as local devDeps, no pnpx): filesystem, mongodb, currencyConverter
- mongodb + currencyConverter are registered **only when** their env var is set (`MONGODB_URL`, `FREE_CURRENCY_KEY`) — filesystem always runs
- Uses `createAgent` from `langchain` (the non-deprecated successor of `createReactAgent`); the agent is built lazily and **reused** across requests
- `GET /` returns `{ service, agent, mcpServers, endpoints }`
- `POST /chat` validates `message` (non-empty string) → `400`; internal errors → `500`
- `pnpm typecheck` — `tsc --noEmit`
- `test.rest` for manual API testing with multiple example prompts
- `.env` needs `OPENAI_API_KEY` (required); `MONGODB_URL`, `FREE_CURRENCY_KEY` optional

## MCP servers

| Server              | Package                                   | Binary                  | Purpose                                           |
| ------------------- | ----------------------------------------- | ----------------------- | ------------------------------------------------- |
| `filesystem`        | `@modelcontextprotocol/server-filesystem` | `mcp-server-filesystem` | Read/write files and directories in the workspace |
| `mongodb`           | `mongodb-mcp-server`                      | `mongodb-mcp-server`    | Query MongoDB databases (read-only, `--readOnly`) |
| `currencyConverter` | `@alcorme/mcp-currency-converter`         | `alcorme-mcp-server`    | Convert between currencies (stdio transport)      |

All @langchain deps are declared explicitly in `package.json` — do not rely on workspace hoisting (a duplicate `@langchain/core` copy is what broke `createReactAgent` typing).
