import { randomUUID } from 'crypto';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { z } from 'zod';
import { withSession } from './graph';

const model = new ChatOpenAI({
  model: 'gpt-4o-mini',
  temperature: 0,
});

const embeddings = new OpenAIEmbeddings({
  model: 'text-embedding-3-small',
});

// Structured output schema for entity/relationship extraction.
const extractionSchema = z.object({
  entities: z.array(
    z.object({
      name: z.string(),
      type: z.enum([
        'Person',
        'Company',
        'Technology',
        'Product',
        'Event',
        'Other',
      ]),
    }),
  ),
  relationships: z.array(
    z.object({
      source: z.string(),
      target: z.string(),
      type: z.string(),
    }),
  ),
});

type Extraction = z.infer<typeof extractionSchema>;

const extractor = model.withStructuredOutput(extractionSchema, {
  name: 'extract_entities_and_relationships',
});

// Simple sentence-based chunker with overlap so entity mentions
// that span chunk boundaries are still captured.
export function chunkText(text: string, maxChunkSize = 400): string[] {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (current && current.length + sentence.length > maxChunkSize) {
      chunks.push(current);
      // Keep the last sentence as overlap for the next chunk.
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

// Ask the LLM to extract entities and relationships from a chunk.
async function extractEntities(text: string): Promise<Extraction> {
  const result = await extractor.invoke(
    `Extract all named entities and the relationships between them from the text below.
     Use the entity's full name (e.g. "Priya Sharma", not "Priya").
     Only include relationships that are explicitly stated in the text.

     Text:
     ${text}`,
  );
  return result;
}

// Store a chunk plus its entities/relationships in the graph.
async function storeChunk(
  chunkId: string,
  text: string,
  source: string,
  embedding: number[],
  extraction: Extraction,
): Promise<void> {
  await withSession(async (session) => {
    await session.executeWrite(async (tx) => {
      // Create the chunk node with its embedding.
      await tx.run(
        `MERGE (c:Chunk {id: $id})
         SET c.text = $text, c.source = $source, c.embedding = $embedding`,
        { id: chunkId, text, source, embedding },
      );

      // Merge entities and link the chunk to each one it mentions.
      for (const entity of extraction.entities) {
        await tx.run(
          `MERGE (e:Entity {name: $name})
           SET e.type = $type
           WITH e
           MATCH (c:Chunk {id: $id})
           MERGE (c)-[:MENTIONS]->(e)`,
          { name: entity.name, type: entity.type, id: chunkId },
        );
      }

      // Merge relationships between entities.
      for (const rel of extraction.relationships) {
        await tx.run(
          `MATCH (a:Entity {name: $source})
           MATCH (b:Entity {name: $target})
           MERGE (a)-[r:RELATES_TO {type: $type}]->(b)`,
          { source: rel.source, target: rel.target, type: rel.type },
        );
      }
    });
  });
}

// Full ingestion pipeline for a single document.
export async function ingestDocument(
  text: string,
  source: string,
): Promise<{ chunks: number; entities: number; relationships: number }> {
  const chunks = chunkText(text);
  let entityCount = 0;
  let relationshipCount = 0;

  for (const chunk of chunks) {
    const chunkId = randomUUID();
    const [embedding, extraction] = await Promise.all([
      embeddings.embedQuery(chunk),
      extractEntities(chunk),
    ]);

    await storeChunk(chunkId, chunk, source, embedding, extraction);
    entityCount += extraction.entities.length;
    relationshipCount += extraction.relationships.length;
  }

  return {
    chunks: chunks.length,
    entities: entityCount,
    relationships: relationshipCount,
  };
}
