import uvicorn


def main() -> None:
    uvicorn.run("langchain_python.main:app", host="0.0.0.0", port=3000, reload=True)
