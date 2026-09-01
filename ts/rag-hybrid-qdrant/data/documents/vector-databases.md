# Vector Databases

Vector databases store embeddings — dense arrays of numbers that represent semantics — and answer "nearest neighbor" queries. They are the retrieval engine behind most RAG systems.

## Dense vectors

Dense embeddings like OpenAI's `text-embedding-3-small` map each piece of text to 1536 floats. Similar text lands close together in this space, so cosine similarity becomes a proxy for meaning.

### Why cosine?

Cosine similarity measures the angle between two vectors. Two short, on-topic sentences can have a high score even if one is barely longer than the other; raw dot product would instead favor longer texts. Most dense indexes therefore store normalized vectors and rank by cosine.

## Sparse vectors

Sparse vectors are the opposite: mostly zeros with a handful of non-zero entries, one per token that actually appears. They power exact, keyword-style matching — great for product codes, scientific names, and error messages that semantic search blurs.

### BM25

BM25 is the classic sparse ranking function. It weights a term by how rare it is across the corpus (IDF) and how often it appears in a document, saturating repeats and normalizing for document length. Hybrid search fuses these two signals so neither is a single point of failure.

## Hybrid search

Neither signal is always right. Dense understands paraphrases but can miss exact codes; sparse matches exact terms but ignores synonyms. Hybrid retrieval runs both and fuses the ranked lists with Reciprocal Rank Fusion (RRF), keeping the best of each.
