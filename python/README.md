# AI Concepts — Python

Python project mirrors of the TypeScript knowledge base in [`../ts`](../ts). Each project pairs with its TS sibling so concepts can be compared across languages.

> Languages are meant to be learned side by side: same concept routes, same `CONCEPTS.md` structure, different syntax.

## Projects

| Project | Status | TS sibling |
|---|---|---|
| [langchain](langchain/) | FastAPI — one route per LangChain concept | [`../ts/langchain`](../ts/langchain) |

## Prerequisites

- Python 3.12+
- [uv](https://docs.astral.sh/uv/)

## Workflow

```sh
cd langchain
cp .env_example .env   # add your API key
uv sync                # create .venv + install deps
uv run uvicorn langchain_python.main:app --reload --port 3000
```

Each project has its own `AGENTS.md`, `README.md`, `CONCEPTS.md`, and `test.http` with detailed instructions.
