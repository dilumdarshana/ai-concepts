# langchain (Python)

FastAPI app demonstrating major LangChain concepts, one route per concept. Mirrors `ts/langchain` 1:1.

- Python 3.12+, managed with **uv** (`pyproject.toml`, `uv.lock`, `.venv`)
- `uv sync` to install; `uv run uvicorn langchain_python.main:app --reload` to run
- FastAPI on port 3000 — `GET /` lists concept routes, `/docs` has OpenAPI docs
- Concept routes: `/messages`, `/prompt`, `/chat-prompt`, `/structured`, `/chain`, `/lc`, `/stream`, `/tools`, `/memory`, `/trim`
- Uses LangGraph `StateGraph` + `MemorySaver` (keyed by `thread_id`) for memory
- `test.http` for manual API testing
- `.env` needs `OPENAI_API_KEY`

## Critical gotchas

- **JSON bodies need Pydantic models** — FastAPI treats bare scalar params as *query* params, so every route takes a request-model class (see `../ts/langchain/server.ts` which uses `req.body`).
- **Dotenv is loaded in `main.py` via `load_dotenv()`** — uvicorn must import `langchain_python.main` (not run the module) so `.env` is read before `ChatOpenAI` is constructed.
- Python naming is snake_case: `with_structured_output`, `bind_tools`, `trim_messages`, `ainvoke`, `astream`.
- `add_messages` reducer (`Annotated[list, add_messages]`) is what makes the LangGraph `messages` list accumulate.
