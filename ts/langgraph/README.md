# LangGraph

Express server with a LangGraph ReAct agent that can:

- **Convert currency** via Free Currency API (`convertCurrency`)
- **Introspect any PostgreSQL database** — discover tables, columns, and types (`getDatabaseSchema`)
- **Query any table** with read-only SQL (`queryDatabase`)

The agent uses GPT-4o-mini and decides which tools to call based on natural-language input.

## Quick start

```bash
pnpm dev:langgraph          # from workspace root
```

Server starts on **port 3000**.

## Setup

Copy the environment file and fill in your keys:

```bash
cp .env_example .env
```

Required variables:

| Variable            | Description                                              |
| ------------------- | -------------------------------------------------------- |
| `OPENAI_API_KEY`    | OpenAI API key for GPT-4o-mini                           |
| `FREE_CURRENCY_KEY` | Free Currency API key (free tier at freecurrencyapi.com) |
| `DATABASE_URL`      | PostgreSQL connection string (works with Neon, RDS, etc) |

For Neon, use the pooled connection string from your Neon dashboard. SSL is handled automatically by the adapter.

## Usage

```bash
curl -X POST http://localhost:3000/agent \
  -H "Content-Type: application/json" \
  -d '{"message": "What tables exist in the database?"}'
```

### Example questions

**Currency conversion:**
- "100 USD to EUR"
- "How much is 50 GBP in JPY?"

**Database schema (no DB = graceful error):**
- "What tables exist in the database?"
- "Show me the columns of the country table"

**Data queries:**
- "How many records are in the country table?"
- "Show all countries from the database"

## Architecture

```
POST /agent
  └─ agent.ts  ──  createReactAgent(llm, tools)
       ├─ tools/currencyTool.ts    ──  Free Currency API
       └─ tools/databaseTool.ts    ──  Prisma → PostgreSQL
              └─ lib/prisma.ts     ──  PrismaPg adapter (Prisma 7)
```

- **server.ts** — Express entry point, loads env vars before importing the agent
- **agent.ts** — Creates the LangGraph ReAct agent with tool bindings
- **tools/currencyTool.ts** — Calls Free Currency API for real-time exchange rates
- **tools/databaseTool.ts** — Two generic tools: schema introspection + read-only SQL
- **lib/prisma.ts** — Prisma 7 client with `PrismaPg` adapter for PostgreSQL
- **prisma/schema.prisma** — Schema definition (your actual DB may differ)

## Tools

| Tool                 | What it does                                                |
| -------------------- | ----------------------------------------------------------- |
| `convertCurrency`    | Real-time currency conversion via Free Currency API         |
| `getDatabaseSchema`  | Introspects `information_schema` to discover tables/columns |
| `queryDatabase`      | Runs a `SELECT` query and returns JSON results              |

The schema + query tools work with **any** PostgreSQL database — not a hardcoded schema.

## Dependencies

| Package               | Purpose                           |
| --------------------- | --------------------------------- |
| `@prisma/client`      | Prisma 7 ORM (Rust-free engine)   |
| `@prisma/adapter-pg`  | PostgreSQL driver adapter         |
| `pg`                  | Node.js PostgreSQL driver         |
| `zod`                 | Schema validation for tool inputs |
