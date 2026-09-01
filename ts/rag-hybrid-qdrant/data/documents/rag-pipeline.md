# Retrieval-Augmented Generation

RAG grounds a language model in external documents so it can answer questions about data it was never trained on. It has two halves: an offline ingestion pipeline and an online retrieval step.

## Ingestion pipeline

### 1. Load

Documents arrive from many sources: markdown files, JSON exports, PDFs, web pages. Each loader normalizes them into plain text plus metadata.

### 2. Chunk

Raw text is too big to embed or pass to a model. Content-aware chunking splits on structure — headings, paragraphs, list items — rather than fixed character counts, so each chunk is a self-contained unit of meaning.

### 3. Embed

Every chunk is embedded into a dense vector. The vectors are pushed into a vector database with the chunk's text and metadata as payload.

## Retrieval

At query time the question is embedded, nearest neighbors are fetched, and the top chunks are passed to the model as context.

### Hybrid retrieval

Hybrid search runs dense and sparse retrieval in parallel and fuses the results with Reciprocal Rank Fusion. Dense covers paraphrases and synonyms; sparse covers exact identifiers and technical terms.

### Re-ranking

An optional cross-encoder scores each candidate query-plus-document jointly, ordering the final few by true relevance rather than by vector proximity alone.
