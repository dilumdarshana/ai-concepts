/**
 * Shared tokenizer for the sparse (BM25) channel.
 *
 * BM25 matches EXACT terms, so normalization here directly controls what
 * "exact" means:
 *   - lowercase      -> "Denzel" and "denzel" are the same term
 *   - split on any   -> punctuation/whitespace never become terms
 *     run of non-alphanumerics
 *   - filter(Boolean)-> drop empty strings produced by leading/trailing splits
 *
 * Deliberately NO stemming or stop-word removal: "animated" and "Animation"
 * stay different terms. That limitation is exactly why hybrid retrieval also
 * needs the dense channel (see CONCEPTS.md §1).
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}
