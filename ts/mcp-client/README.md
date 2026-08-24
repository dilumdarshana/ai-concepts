# MCP Client

Multi-server MCP client that connects to subprocess MCP servers and exposes a LangGraph React agent over HTTP.

## Prerequisites

- Node 24.15+
- pnpm 11.5+
- OpenAI API key (`OPENAI_API_KEY`)

## Setup

```sh
pnpm install
cp .env_example .env   # at minimum set OPENAI_API_KEY
```

## Run

```sh
pnpm dev:mcp-client
```

Server starts on `http://localhost:3000`.

## API

### GET /

Health/info route. Returns the service name, agent type, and configured MCP servers.

### POST /chat

Send a message and get a response from the agent. `message` must be a non-empty string; a missing/blank value returns `400`, an internal error returns `500`.

```http
POST http://localhost:3000/chat
Content-Type: application/json

{ "message": "how many files in the current folder?" }
```

## MCP Servers

| Server              | Package                                   | Purpose                                           |
| ------------------- | ----------------------------------------- | ------------------------------------------------- |
| `filesystem`        | `@modelcontextprotocol/server-filesystem` | Read/write files and directories in the workspace |
| `mongodb`           | `mongodb-mcp-server`                      | Query MongoDB databases (read-only)               |
| `currencyConverter` | `@alcorme/mcp-currency-converter`         | Convert between currencies                        |

All MCP servers are pinned as local devDependencies and launched from `node_modules/.bin` (no `pnpx` on-demand downloads). The filesystem server always runs; the MongoDB and currency converter servers are registered only when their env vars are set (`MONGODB_URL`, `FREE_CURRENCY_KEY`), so the demo works with just `OPENAI_API_KEY`.

### Type-check

```sh
pnpm --filter mcp-client typecheck   # or cd ts/mcp-client && tsc --noEmit
```

> Note: `@langchain/*` dependencies are declared explicitly in `package.json`. Don't rely on workspace hoisting — a duplicate `@langchain/core` copy causes a tool typing mismatch. The agent uses `createAgent` from `langchain` (the non-deprecated successor of `createReactAgent`).

## Example Prompts

- `"how many files in the current folder?"`
- `"list all .ts files and show their sizes"`
- `"list databases I have"`
- `"how many documents in the company collection?"`
- `"convert 100 USD to EUR"`

## Dev

```sh
pnpm dev:mcp-client   # starts with nodemon + ts-node
```

Manual testing: use `test.rest` with VS Code REST Client.
