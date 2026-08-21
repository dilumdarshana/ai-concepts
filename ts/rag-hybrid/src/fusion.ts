import type { Chunk } from './retrieval.js';

/**
 * A chunk after fusion: same shape as a Chunk, but `score` is now the fused
 * RRF score (incomparable to raw BM25 or cosine scores) and `channels`
 * records which retrieval lists contributed to it.
 */
export interface FusionHit extends Chunk {
  channels: string[];
}

/**
 * Reciprocal Rank Fusion — merges multiple ranked lists into one.
 *
 *   score(doc) = SUM over lists containing doc of:  weight / (k + rank + 1)
 *
 * where rank is 0-based. Key property: RRF uses only POSITIONS, never raw
 * scores, so it can combine metrics that live on different scales (cosine
 * distance ~0..2 vs BM25 ~0..20+) without any normalization step.
 *
 * Behavior notes:
 *   - A document ranked high in BOTH lists accumulates from both and floats
 *     to the top; a fluke hit in a single list stays low.
 *   - k (=60 by default) dampens the rank-1 advantage so top positions don't
 *     completely dominate the sum.
 *   - weights tilt the blend: with dense=0.7 / sparse=0.3, semantic ranking
 *     matters more than lexical, but an exact keyword match still counts.
 */
export function rrfFuse(
  lists: { name: string; chunks: Chunk[]; weight: number }[],
  k = 60,
): FusionHit[] {
  // Accumulator keyed by chunk id: running RRF score + which channels hit it.
  const acc = new Map<string, { chunk: Chunk; score: number; channels: Set<string> }>();

  for (const { name, chunks, weight } of lists) {
    chunks.forEach((chunk, rank) => {
      const entry = acc.get(chunk.id) ?? {
        chunk,
        score: 0,
        channels: new Set<string>(),
      };
      entry.score += weight / (k + rank + 1);
      entry.channels.add(name);
      acc.set(chunk.id, entry);
    });
  }

  return [...acc.values()]
    .sort((a, b) => b.score - a.score)
    .map(({ chunk, score, channels }) => ({
      ...chunk,
      score,
      channels: [...channels],
    }));
}
