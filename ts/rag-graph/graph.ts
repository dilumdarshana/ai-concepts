import neo4j, { Driver, Session } from 'neo4j-driver';

const EMBEDDING_DIM = 1536; // text-embedding-3-small
const VECTOR_INDEX = 'chunk_embeddings';

let driver: Driver | null = null;

export function getDriver(): Driver {
  if (!driver) {
    driver = neo4j.driver(
      process.env.NEO4J_URI || 'bolt://localhost:7687',
      neo4j.auth.basic(
        process.env.NEO4J_USER || 'neo4j',
        process.env.NEO4J_PASSWORD || 'password',
      ),
    );
  }
  return driver;
}

export async function withSession<T>(
  fn: (session: Session) => Promise<T>,
): Promise<T> {
  const session = getDriver().session();
  try {
    return await fn(session);
  } finally {
    await session.close();
  }
}

// Create the vector index for Chunk embeddings (idempotent).
export async function createVectorIndex(): Promise<void> {
  await withSession(async (session) => {
    await session.run(
      `CREATE VECTOR INDEX ${VECTOR_INDEX} IF NOT EXISTS
       FOR (c:Chunk) ON (c.embedding)
       OPTIONS { indexConfig: {
         \`vector.dimensions\`: $dim,
         \`vector.similarity_function\`: 'cosine'
       }}`,
      { dim: neo4j.int(EMBEDDING_DIM) },
    );
  });
}

// Wipe all graph data (used by POST /clear).
export async function clearGraph(): Promise<void> {
  await withSession(async (session) => {
    await session.run('MATCH (n) DETACH DELETE n');
  });
}

// Return graph stats for debugging (POST /graph).
export async function getGraphStats(): Promise<Record<string, unknown>> {
  return withSession(async (session) => {
    const result = await session.run(
      `MATCH (n) RETURN labels(n)[0] AS label, count(*) AS count
       UNION ALL
       MATCH ()-[r]->() RETURN type(r) AS label, count(*) AS count`,
    );
    const stats: Record<string, number> = {};
    for (const record of result.records) {
      const label = record.get('label') as string;
      const count = record.get('count') as number;
      stats[label] = (stats[label] || 0) + Number(count);
    }
    return stats;
  });
}
