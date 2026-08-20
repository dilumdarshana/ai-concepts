import neo4j from 'neo4j-driver';
import { OpenAIEmbeddings } from '@langchain/openai';
import { withSession } from './graph';

const embeddings = new OpenAIEmbeddings({
  model: 'text-embedding-3-small',
});

export type RetrievedChunk = {
  id: string;
  text: string;
  source: string;
  score: number;
  via: 'vector' | 'graph';
};

// 1. Vector search: top-k chunks most similar to the query.
async function vectorSearch(
  queryEmbedding: number[],
  k: number,
): Promise<RetrievedChunk[]> {
  return withSession(async (session) => {
    const result = await session.run(
      `CALL db.index.vector.queryNodes('chunk_embeddings', $k, $embedding)
       YIELD node, score
       RETURN node.id AS id, node.text AS text, node.source AS source, score`,
      { k: neo4j.int(k), embedding: queryEmbedding },
    );

    return result.records.map((record) => ({
      id: record.get('id') as string,
      text: record.get('text') as string,
      source: record.get('source') as string,
      score: record.get('score') as number,
      via: 'vector' as const,
    }));
  });
}

// 2. Graph expansion: from entities mentioned in the vector-matched chunks,
//    walk 1-2 hops to neighbouring entities and pull their chunks.
async function graphExpansion(
  seedChunkIds: string[],
  hops: number,
  limit: number,
): Promise<RetrievedChunk[]> {
  if (seedChunkIds.length === 0) return [];

  return withSession(async (session) => {
    const result = await session.run(
      `MATCH (seed:Chunk) WHERE seed.id IN $seedIds
       MATCH (seed)-[:MENTIONS]->(e:Entity)
       MATCH path = (e)-[:RELATES_TO*1..${hops}]-(neighbor:Entity)
       WITH neighbor, path
       MATCH (c:Chunk)-[:MENTIONS]->(neighbor)
       WHERE NOT c.id IN $seedIds
       RETURN DISTINCT c.id AS id, c.text AS text, c.source AS source,
              length(path) AS distance
       ORDER BY distance ASC
       LIMIT $limit`,
      { seedIds: seedChunkIds, limit: neo4j.int(limit) },
    );

    return result.records.map((record) => ({
      id: record.get('id') as string,
      text: record.get('text') as string,
      source: record.get('source') as string,
      score: 1 / (1 + Number(record.get('distance'))),
      via: 'graph' as const,
    }));
  });
}

// Hybrid retrieval: vector search first, then expand through the graph.
export async function hybridRetrieve(
  query: string,
  options: { vectorK?: number; hops?: number; graphLimit?: number } = {},
): Promise<RetrievedChunk[]> {
  const { vectorK = 3, hops = 2, graphLimit = 5 } = options;

  const queryEmbedding = await embeddings.embedQuery(query);
  const vectorHits = await vectorSearch(queryEmbedding, vectorK);

  const graphHits = await graphExpansion(
    vectorHits.map((c) => c.id),
    hops,
    graphLimit,
  );

  // Deduplicate by chunk id, preferring the vector hit.
  const seen = new Set<string>();
  const merged: RetrievedChunk[] = [];

  for (const chunk of [...vectorHits, ...graphHits]) {
    if (seen.has(chunk.id)) continue;
    seen.add(chunk.id);
    merged.push(chunk);
  }

  return merged;
}
