# voltagent

VoltAgent app with GitHub repo analysis + Express API.

- `pnpm dev:voltagent` from workspace root (uses `tsx watch --env-file=.env ./src`)
- ESM project (`"type": "module"`)
- **Biome** for linting/formatting (only project with real lint):
  - `pnpm lint` — `biome check ./src`
  - `pnpm lint:fix` — `biome check --write ./src`
- `pnpm typecheck` — `tsc --noEmit`
- Two modes: agent (`src/index.ts` supervisor + sub-agents) and Express API (`src/api.ts` with POST /chat + POST /workflow)
- Has Dockerfile (multi-stage, Node 22 Alpine, exposes port 3141)
- Engine requires `node >=20.0.0`
- `.env` needs `OPENAI_API_KEY`, `GITHUB_TOKEN`
