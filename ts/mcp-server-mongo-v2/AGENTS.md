# mcp-server-mongo-v2

MCP server for MongoDB, built on the v2 `@modelcontextprotocol/server` SDK.

- ESM project (`"type": "module"`), Node 20+
- `pnpm build` — `tsc` compiles to `dist/index.js` and sets executable bit (has `bin` field)
- `pnpm build:dev` — `tsx --watch src/index.ts` (no rebuild needed)
- `pnpm dev` — `tsc --watch` (used by `pnpm dev:server-mongo-v2` from workspace root)
- MCP SDK `@modelcontextprotocol/server@^2.0.0` — uses `McpServer` with `registerTool()` / `registerResource()` / `registerPrompt()`
- **Factory-based transports**: `serveStdio(factory)` for stdio, `createMcpHandler(factory)` + `toNodeHandler()` for HTTP. The factory builds a fresh server per connection, capturing `db` / `readOnly` / `logger` in a closure (`src/server.ts`)
- **2 transports**: `TRANSPORT=stdio` (default), `http` — scripts: `pnpm mcp:stdio`, `pnpm mcp:http`. SSE is **not** supported in v2
- **3 tools**: `query`, `count`, `serverInfo` — Zod schemas in `src/tools/*`
- **2 resources**: `mongodb://collections` and `mongodb://collections/{name}`
- **5 prompts**: `analyse-collection`, `query-helper`, `data-exploration`, `performance-review`, `find-recent`
- `MCP_MONGODB_READONLY=true` env var enables read-only mode
- `.env` needs `MCP_MONGODB_URI` (see `.env.example`)

## Critical gotchas

- **dotenv**: use `dotenv.config({ quiet: true })` — plain `dotenv.config()` writes to stdout and breaks MCP stdio JSON-RPC (`src/server.ts`)
- **noUnusedParameters**: unused positional params (e.g. `_readOnly`, `_input`) are underscore-prefixed to satisfy strict TS
- **vitest v4 ESM-only**: `vitest.config.ts` must exclude `dist/` to avoid CJS crash
- **TypeScript 6.0**: `tsconfig.json` must include `"types": ["node", "express", "cors"]` — these are no longer auto-included
- **v2 imports**: import `McpServer`, `createMcpHandler` from `@modelcontextprotocol/server`; `serveStdio` from `@modelcontextprotocol/server/stdio`; `toNodeHandler` from `@modelcontextprotocol/node`. Do NOT import from `@modelcontextprotocol/sdk`

## Statelessness (SEP-2575)

MCP is **stateless-first**: the `initialize` handshake is removed and every request is self-contained (per-request `MCP-Protocol-Version` header + `_meta`, per-request client capabilities, `server/discover` for discovery). `createMcpHandler` serves legacy 2025-era traffic statelessly by default.

- The **factory pattern is mandatory** — never share one server instance across requests; the SDK calls the factory per request/connection
- `db` and `readOnly` are **immutable shared config** captured in the factory closure — do not mutate them per request
- **Never hold mutable per-request state in the server.** If stateful features are needed later (chat history, per-user context, etc.), externalize them (MongoDB, Redis, cache) keyed by something the client sends — the server instance cannot carry state

## Tests

```bash
pnpm test                   # run all tests
pnpm test -- -t "parse"     # single test pattern
pnpm coverage               # with coverage
```

- `src/tools/query.test.ts` mocks the MongoDB collection — no real DB
- `src/utils/parseFilter.test.ts` covers ObjectId/date conversion

## Dev

```bash
pnpm build          # type-check + compile
pnpm inspector      # build + launch MCP Inspector
pnpm mcp:stdio      # build + run stdio mode
```