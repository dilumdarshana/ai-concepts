# MCP Client

Multi-server MCP client that connects to subprocess MCP servers and exposes a LangGraph React agent over HTTP.

## Prerequisites

- Node 24.15+
- pnpm 11.5+
- OpenAI API key (`OPENAI_API_KEY`)

## Setup

```sh
pnpm install
cp .env_example .env   # fill in your keys
```

## Run

```sh
pnpm dev:mcp-client
```

Server starts on `http://localhost:3000`.

## API

### POST /chat

Send a message and get a response from the agent.

```http
POST http://localhost:3000/chat
Content-Type: application/json

{ "message": "how many files in the current folder?" }
```

## MCP Servers

| Server | Package | Purpose |
|---|---|---|
| `filesystem` | `@modelcontextprotocol/server-filesystem` | Read/write files and directories in the workspace |
| `mongodb` | `mongodb-mcp-server` | Query MongoDB databases (read-only) |
| `currencyConverter` | `@alcorme/mcp-currency-converter` | Convert between currencies |

Requires `.env` variables for MongoDB (`MONGODB_URL`) and currency converter (`FREE_CURRENCY_KEY`).

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
