# Generate AI Concepts

## There are several projects

### langchain

### langgraph (agent with multiple tools) - express app
- langgraph can memorise the privious conversation
- 

### chromadb (vector database) - express app
```bash
# Install npm modules from root
$ pnpm install

# Run chromadb server
$ pnpm dev:chromadb

# Add individual npm modules from root
$ pnpm add chromadb --filter chromadb
```

### rag-json (Retrieval Augmented Generation) - nextjs app
- data source provided by JSON file

### rag-huggingface (Retrieval Augmented Generation) - express app
- pinecone: Pinecone vector can not be reverse to the original text
- sentence-transformers: huggingface free embedding model
- chat endpoint

```bash
# Run chromadb server
$ pnpm dev:rag-huggingface
```

## mcp (MCP Client)
- Connect multiple MCP servers using langchain mcp adaptor

## mcp-server-mongo (MCP Server)
- Connecto with given mongodb
- Query database
- Insert/update/delete records (TBD)

### rag-redis (Retrieval Augmented Generation) - express app

