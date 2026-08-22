# docs — Knowledge Base Conventions

This folder contains concept overviews. Each doc is self-contained, cross-linked, and follows a consistent structure.

## Structure

Every doc should have:

1. **Title + one-sentence summary**
2. **Table of contents** (auto-linked headings)
3. **Sections** with clear headings
4. **Mermaid diagrams** where they clarify — rendered on GitHub
5. **Tables** for comparisons, mappings, tradeoffs
6. **Concept → code/project map** table at the end
7. **Further reading** — markdown links (not backticks)

## Cross-linking

- Internal: `[title](file.md)` or `[title](file.md#section)`
- External: full URL
- Never use backticks for internal links

## Style

- Mermaid diagrams use `flowchart`, `sequenceDiagram`, `erDiagram` as needed
- Tables over bullet lists when comparing
- Code references use `file_path:line_number` or `file_path` when pointing to a function
- Reference workspace projects by folder name (`rag-graph`, `langgraph`, etc.)

## Further reading

Must be a markdown list with links:

```markdown
## Further reading

- [llm-fundamentals.md](llm-fundamentals.md) — why prompts steer probabilities
- [ts/rag-graph/CONCEPTS.md](../ts/rag-graph/CONCEPTS.md) — entity extraction in depth
- [OpenAI tokenizer](https://platform.openai.com/tokenizer)
```

## Suggested reading order

The index (`README.md`) defines the learning path. New docs should be added there with a one-line description and placed in the order.

## No CI, no tests

This folder has no lint/typecheck. Consistency is maintained by convention and review.