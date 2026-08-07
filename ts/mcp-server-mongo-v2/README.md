# MongoDB MCP Server

Model Context Protocol (MCP) server for MongoDB. Exposes MongoDB collections, queries, counts, and server info to LLM agents and MCP clients.

## Features

- **MCP-compliant server** using `@modelcontextprotocol/server` (v2) `McpServer` (modern `registerTool` / `registerResource` / `registerPrompt` API)
- **Transport Support**: Stdio and HTTP (configurable via `TRANSPORT`)
- **Type Safety**: Built with TypeScript + Zod schemas
- **Unit Testing**: Vitest powered unit testing
- **Read-only mode** support (`MCP_MONGODB_READONLY` or `--readonly`)

## Prerequisites

- Node 20+
- pnpm 11+
- A MongoDB connection URI (e.g. MongoDB Atlas)

## Setup

```sh
pnpm install
cp .env.example .env   # set MCP_MONGODB_URI
```

## Configuration

| Variable | Description |
|---|---|
| `MCP_MONGODB_URI` | MongoDB connection string (required) |
| `MCP_MONGODB_READONLY` | `true` to force read-only mode (optional) |
| `TRANSPORT` | `stdio` (default) / `http` |
| `PORT` | Port for `http` transport (default `3000`) |

Read-only mode can also be enabled per-run with the `--readonly` flag, or the URI passed directly with `--url=<uri>`.

## Development

```sh
pnpm build              # type-check + compile (tsc)
pnpm build:dev          # tsx --watch (no rebuild needed)
pnpm test               # vitest
pnpm coverage           # with coverage
pnpm inspector          # build + launch MCP Inspector
```

## Run

```sh
pnpm mcp:stdio          # build + run stdio mode (used by MCP clients)
pnpm mcp:http           # build + run http mode on PORT
pnpm dev:server-mongo-v2 # from workspace root (tsc --watch)
```

### Debug with MCP Inspector

```sh
pnpm inspector
```

This launches the MCP Inspector so you can exercise tools, resources, and prompts interactively.

## Integrate with an MCP client

This server is not published to npm, so clients launch the local build (`dist/index.js`). Build it first with `pnpm build`, then point your client at the absolute path.

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mongodb": {
      "command": "node",
      "args": ["/path/to/mcp-server-mongo-v2/dist/index.js"],
      "env": {
        "TRANSPORT": "stdio",
        "MCP_MONGODB_URI": "mongodb+srv://user:password@cluster.mongodb.net/dbname",
        "MCP_MONGODB_READONLY": "true"
      }
    }
  }
}
```

### VS Code GitHub Copilot

Edit VS Code's `mcp.json` (`.vscode/mcp.json` in your project or the global User `mcp.json`):

```json
{
  "servers": {
    "mongodb": {
      "command": "node",
      "args": ["/path/to/mcp-server-mongo-v2/dist/index.js"],
      "env": {
        "TRANSPORT": "stdio",
        "MCP_MONGODB_URI": "mongodb+srv://user:password@cluster.mongodb.net/dbname",
        "MCP_MONGODB_READONLY": "true"
      }
    }
  }
}
```

Using HTTP transport (works well with VS Code Copilot Agent):

```json
{
  "servers": {
    "mongodb": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "env": {
        "TRANSPORT": "http",
        "MCP_MONGODB_URI": "mongodb+srv://user:password@cluster.mongodb.net/dbname"
      }
    }
  }
}
```

### OpenCode

Add to your `opencode.json` or `.opencode.json`:

```json
{
  "mcp": {
    "mongodb": {
      "type": "local",
      "command": ["node", "/path/to/mcp-server-mongo-v2/dist/index.js"],
      "environment": {
        "TRANSPORT": "stdio",
        "MCP_MONGODB_URI": "mongodb+srv://user:password@cluster.mongodb.net/dbname",
        "MCP_MONGODB_READONLY": "true"
      }
    }
  }
}
```

## Tools

| Tool | Description |
|---|---|
| `query` | Run a MongoDB query with optional projection, limit, sort, and `explain` |
| `count` | Count documents matching a query |
| `serverInfo` | Get MongoDB version, storage engine, and connection details |

## Resources

- `mongodb://collections` — lists all collections in the database
- `mongodb://collections/{name}` — schema summary of a collection (field names, types, nullability, examples, indexes, document count)

## Prompts

- `analyse-collection` — inspect a collection's structure and data quality
- `query-helper` — help writing a MongoDB query
- `data-exploration` — summarise a collection's data
- `performance-review` — review collection performance and indexes
- `find-recent` — find documents added in the last N days

## License

ISC