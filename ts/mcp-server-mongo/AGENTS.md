# mcp-server-mongo

MCP server (stdio) for MongoDB.

- ESM project (`"type": "module"`)
- `pnpm dev` — `tsc --watch` (not nodemon, unlike most sibling projects)
- `pnpm build` — compiles to `dist/index.js` and sets executable bit (has `bin` field)
- MCP **server** (not client) using `StdioServerTransport` — communicates over stdin/stdout
- `MCP_MONGODB_READONLY=true` env var enables read-only mode
- `pnpm inspector` — launch MCP Inspector for debugging
- Used as a subprocess by the `mcp` client project
- `.env` needs `MONGODB_URI`
