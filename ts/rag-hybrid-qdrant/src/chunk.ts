import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Chunk } from './types.js';

/**
 * Content-aware chunking.
 *
 * The whole point of this project. Fixed-width chunking splits a page into
 * arbitrary byte runs, so a chunk can begin mid-sentence and mix two
 * unrelated sections. Content-aware chunking instead splits on the document's
 * own structure:
 *
 *   - Markdown -> walk the heading tree, group a section's body under its
 *     heading, and prefix each chunk with a breadcrumb of the heading path.
 *     Retrieval then sees "Vector Databases > Sparse vectors > BM25", which
 *     both keeps the chunk self-contained and makes the heading recoverable.
 *   - JSON     -> for an array, one chunk per element ("Chunk per row").
 *   - Plain    -> split on paragraphs/blank lines, then by length.
 *
 * Sections longer than `maxChars` are further split with an overlap so a
 * relevant sentence never straddles the boundary and gets lost.
 */

const MAX_CHARS = 1500;
const OVERLAP = 150;

interface LoadedDoc {
  name: string;
  content: string;
}

/**
 * Reads every supported document under `dir` (non-recursively, one level),
 * returning them as { name, content }. Supported extensions mimic the
 * layout in data/documents/: markdown, json, jsonl, and plain text.
 */
export function loadDocuments(dir: string): LoadedDoc[] {
  const docs: LoadedDoc[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isFile() && /\.(md|mdx|json|txt)$/i.test(entry)) {
      docs.push({ name: entry, content: readFileSync(full, 'utf8') });
    }
  }
  return docs;
}

/** Dispatches to the format-aware chunker based on file extension. */
export function chunkDocument(name: string, content: string): Chunk[] {
  const ext = path.extname(name).toLowerCase();
  if (ext === '.md' || ext === '.mdx') {
    return chunkMarkdown(name, content);
  }
  if (ext === '.json' || ext === '.jsonl') {
    return chunkJson(name, content);
  }
  return chunkPlain(name, content);
}

/** Chunks every loaded document into the collection's chunks. */
export function chunkAll(docs: LoadedDoc[]): Chunk[] {
  return docs.flatMap((doc) => chunkDocument(doc.name, doc.content));
}

/**
 * Markdown: split at headings and keep an ordered heading stack for the
 * breadcrumb. A heading of level N closes all previously seen headings at
 * level >= N, so the stack always reflects the current outline position.
 */
function chunkMarkdown(name: string, content: string): Chunk[] {
  const lines = content.split('\n');
  const stack: { level: number; text: string }[] = [];
  const chunks: Chunk[] = [];
  let body: string[] = [];

  const flush = () => {
    if (body.length === 0) return;
    const breadcrumb = stack.map((h) => h.text).join(' > ');
    const bodyText = body.join('\n').trim();
    for (const part of splitText(bodyText, MAX_CHARS, OVERLAP)) {
      chunks.push(makeChunk(name, stack, part, breadcrumb));
    }
    body = [];
  };

  for (const line of lines) {
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      const level = heading[1].length;
      while (stack.length > 0 && stack[stack.length - 1].level >= level)
        stack.pop();
      stack.push({ level, text: heading[2].trim() });
      continue;
    }
    body.push(line);
  }
  flush();
  return chunks;
}

/**
 * JSON: an array becomes one chunk per element ("chunk per row" — the most
 * useful mapping for structured data). A non-array becomes a single chunk.
 */
function chunkJson(name: string, content: string): Chunk[] {
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed)) {
    return [makeJsonChunk(name, 0, parsed)];
  }
  return parsed.map((item, index) => makeJsonChunk(name, index, item));
}

/** Plain text: split on blank lines (paragraphs), then on length. */
function chunkPlain(name: string, content: string): Chunk[] {
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: Chunk[] = [];
  for (const para of paragraphs) {
    for (const part of splitText(para, MAX_CHARS, OVERLAP)) {
      chunks.push(makeChunk(name, [], part, ''));
    }
  }
  return chunks;
}

/** Builds a chunk carrying its heading breadcrumb as retrievable context. */
function makeChunk(
  name: string,
  stack: { level: number; text: string }[],
  part: string,
  breadcrumb: string,
): Chunk {
  return {
    id: `${name}::${stack.map((h) => h.level).join('-')}::${part.slice(0, 16).trim()}`,
    text: breadcrumb ? `${breadcrumb}\n\n${part}` : part,
    metadata: {
      source: name,
      path: breadcrumb,
      type: 'markdown',
    },
  };
}

/** Builds a chunk from one JSON element, with a title if the element has one. */
function makeJsonChunk(name: string, index: number, item: unknown): Chunk {
  const record = (item ?? {}) as Record<string, unknown>;
  const title = record.title ?? record.name ?? record.id;
  return {
    id: `${name}::${index}`,
    text: JSON.stringify(item, null, 2),
    metadata: {
      source: name,
      index,
      title: title ?? `row ${index}`,
      type: 'json',
    },
  };
}

/**
 * Splits a string into pieces of <= maxChars, keeping `overlap` chars of
 * tail on each piece so a relevant sentence isn't cut in half. Words are
 * never split: the split point backs up to the previous space.
 */
function splitText(text: string, maxChars: number, overlap: number): string[] {
  if (text.length <= maxChars) return [text];
  const parts: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const space = text.lastIndexOf(' ', end);
      if (space > start) end = space;
    }
    parts.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return parts;
}
