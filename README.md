# Generate AI Concepts

## There are several projects

### langchain

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

```bash
# Run chromadb server
$ pnpm dev:rag-huggingface
```
