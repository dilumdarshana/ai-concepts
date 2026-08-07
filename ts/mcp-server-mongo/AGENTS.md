# mcp-server-mongo

MCP server for MongoDB.

- ESM project (`"type": "module"`), Node 20+
- `pnpm build` — `tsc` compiles to `dist/index.js` and sets executable bit (has `bin` field)
- `pnpm build:dev` — `tsx --watch src/index.ts` (no rebuild needed)
- `pnpm dev` — `tsc --watch` (used by `pnpm dev:server-mongo` from workspace root)
- MCP SDK `^1.29.0` — uses `McpServer` with `registerTool()` / `registerResource()` / `registerPrompt()` (NOT the deprecated `tool()` / `resource()` / `prompt()`)
- **3 transports**: `TRANSPORT=stdio` (default), `http`, `sse` — scripts: `pnpm mcp:stdio`, `pnpm mcp:http`, `pnpm mcp:sse`
- **3 tools**: `query`, `count`, `serverInfo` — Zod schemas in `src/tools/*`
- **2 resources**: `mongodb://collections` and `mongodb://collections/{name}`
- **5 prompts**: `analyse-collection`, `query-helper`, `data-exploration`, `performance-review`, `find-recent`
- `MCP_MONGODB_READONLY=true` env var enables read-only mode
- Used as a subprocess by the `mcp-client` project
- `.env` needs `MCP_MONGODB_URI` (see `.env.example`)

## Critical gotchas

- **dotenv**: use `dotenv.config({ quiet: true })` — plain `dotenv.config()` writes to stdout and breaks MCP stdio JSON-RPC (`src/server.ts`)
- **noUnusedParameters**: unused positional params (e.g. `_readOnly`, `_input`) are underscore-prefixed to satisfy strict TS
- **vitest v4 ESM-only**: `vitest.config.ts` must exclude `dist/` to avoid CJS crash
- **TypeScript 6.0**: `tsconfig.json` must include `"types": ["node", "express", "cors"]` — these are no longer auto-included

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
