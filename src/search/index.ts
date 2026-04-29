import * as fs from "node:fs/promises";
import { resolve } from "node:path";
import { cwd } from "node:process";
import fg from "fast-glob";
import { embed, embedMany } from "ai";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { safeResolve } from "../file/path-utils";

const INDEX_FILE = ".w3x/search-index.json";

interface CodeChunk {
  file: string;
  content: string;
  startLine: number;
  endLine: number;
  hash: string; // simple hash to detect changes
}

interface SearchIndex {
  chunks: CodeChunk[];
  embeddings: number[][];
  indexedAt: number;
  fileCount: number;
}

let indexCache: { index: SearchIndex; mtimeMs: number } | null = null;

function selectTopK<T>(items: T[], k: number, score: (item: T) => number): T[] {
  if (k <= 0) return [];
  const top: T[] = [];
  for (const item of items) {
    const itemScore = score(item);
    if (top.length < k) {
      top.push(item);
      top.sort((a, b) => score(a) - score(b));
      continue;
    }
    if (itemScore > score(top[0])) {
      top[0] = item;
      top.sort((a, b) => score(a) - score(b));
    }
  }
  return top.sort((a, b) => score(b) - score(a));
}

/** Simple hash for change detection */
function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

/** Split source file into semantic chunks (by function/class boundaries) */
function chunkFile(filePath: string, content: string): CodeChunk[] {
  const lines = content.split("\n");
  const chunks: CodeChunk[] = [];
  let currentChunk: string[] = [];
  let chunkStart = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Start a new chunk at function/class/export/import boundaries
    if (
      (trimmed.startsWith("export ") ||
        trimmed.startsWith("function ") ||
        trimmed.startsWith("class ") ||
        trimmed.startsWith("interface ") ||
        trimmed.startsWith("type ") ||
        trimmed.startsWith("import ") ||
        trimmed.startsWith("const ") ||
        trimmed.startsWith("async function")) &&
      currentChunk.length >= 5
    ) {
      const chunkContent = currentChunk.join("\n");
      if (chunkContent.trim()) {
        chunks.push({
          file: filePath,
          content: chunkContent,
          startLine: chunkStart,
          endLine: chunkStart + currentChunk.length - 1,
          hash: simpleHash(chunkContent),
        });
      }
      currentChunk = [];
      chunkStart = i + 1;
    }

    currentChunk.push(line);

    // Max chunk size: 80 lines
    if (currentChunk.length >= 80) {
      const chunkContent = currentChunk.join("\n");
      chunks.push({
        file: filePath,
        content: chunkContent,
        startLine: chunkStart,
        endLine: chunkStart + currentChunk.length - 1,
        hash: simpleHash(chunkContent),
      });
      currentChunk = [];
      chunkStart = i + 1;
    }
  }

  // Final chunk
  if (currentChunk.length > 0) {
    const chunkContent = currentChunk.join("\n");
    if (chunkContent.trim()) {
      chunks.push({
        file: filePath,
        content: chunkContent,
        startLine: chunkStart,
        endLine: chunkStart + currentChunk.length - 1,
        hash: simpleHash(chunkContent),
      });
    }
  }

  return chunks;
}

/** Scan codebase and build chunk list */
async function scanCodebase(root: string): Promise<CodeChunk[]> {
  const files = await fg("**/*.{ts,tsx,js,jsx,py,rs,go,java}", {
    cwd: root,
    ignore: ["node_modules/**", "dist/**", ".git/**", ".w3x/**", "build/**", "target/**"],
    absolute: false,
  });

  const allChunks: CodeChunk[] = [];
  const maxFiles = 200;
  const selectedFiles = files.slice(0, maxFiles);

  const concurrency = 16;
  for (let i = 0; i < selectedFiles.length; i += concurrency) {
    const batch = selectedFiles.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      batch.map(async (file) => {
        const content = await fs.readFile(resolve(root, file), "utf-8");
        if (content.length < 10000) {
          return chunkFile(file, content);
        }
        return [] as CodeChunk[];
      }),
    );
    for (const result of settled) {
      if (result.status === "fulfilled") {
        allChunks.push(...result.value);
      }
    }
  }

  return allChunks.slice(0, 1000); // cap total chunks
}

/**
 * Get an embedding model. Tries OpenAI first, then Google, falls back gracefully.
 */
let embeddingModelCache: ReturnType<typeof openai.embedding> | ReturnType<typeof google.textEmbeddingModel> | null = null;

function getEmbeddingModel() {
  if (embeddingModelCache) return embeddingModelCache;
  if (process.env.OPENAI_API_KEY) {
    embeddingModelCache = openai.embedding("text-embedding-3-small");
    return embeddingModelCache;
  }
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    embeddingModelCache = google.textEmbeddingModel("text-embedding-004");
    return embeddingModelCache;
  }
  return null;
}

/**
 * Build the semantic search index.
 * Returns true if embedding-backed, false if fallback.
 */
export async function buildSearchIndex(): Promise<{
  success: boolean;
  embedded: boolean;
  chunks: number;
  files: number;
  message: string;
}> {
  const buildStart = Date.now();
  const root = cwd();
  const chunks = await scanCodebase(root);

  if (chunks.length === 0) {
    return { success: false, embedded: false, chunks: 0, files: 0, message: "No source files found to index" };
  }

  const embeddingModel = getEmbeddingModel();
  let embeddings: number[][] = [];
  let previous: SearchIndex | null = null;
  try {
    const prevRaw = await fs.readFile(safeResolve(INDEX_FILE), "utf-8");
    previous = JSON.parse(prevRaw) as SearchIndex;
  } catch {
    previous = null;
  }
  const previousByHash = new Map<string, number[]>();
  if (previous) {
    previous.chunks.forEach((chunk, i) => {
      const emb = previous?.embeddings[i];
      if (emb) previousByHash.set(chunk.hash, emb);
    });
  }

  if (embeddingModel) {
    try {
      embeddings = new Array(chunks.length);
      const missing: Array<{ idx: number; value: string }> = [];
      chunks.forEach((chunk, idx) => {
        const cached = previousByHash.get(chunk.hash);
        if (cached) {
          embeddings[idx] = cached;
        } else {
          missing.push({ idx, value: chunk.content.slice(0, 2000) });
        }
      });
      if (missing.length > 0) {
        const result = await embedMany({
          model: embeddingModel,
          values: missing.map((m) => m.value),
        });
        missing.forEach((m, i) => {
          embeddings[m.idx] = result.embeddings[i];
        });
      }
    } catch {
      // fallback to no embeddings
      embeddings = [];
    }
  }

  const index: SearchIndex = {
    chunks,
    embeddings,
    indexedAt: Date.now(),
    fileCount: new Set(chunks.map((c) => c.file)).size,
  };

  const indexPath = safeResolve(INDEX_FILE);
  await fs.mkdir(resolve(indexPath, ".."), { recursive: true });
  await fs.writeFile(indexPath, JSON.stringify(index), "utf-8");
  const stats = await fs.stat(indexPath);
  indexCache = { index, mtimeMs: stats.mtimeMs };

  return {
    success: true,
    embedded: embeddings.length > 0,
    chunks: chunks.length,
    files: index.fileCount,
    message: embeddings.length > 0
      ? `Indexed ${chunks.length} chunks across ${index.fileCount} files with embeddings in ${Date.now() - buildStart}ms`
      : `Indexed ${chunks.length} chunks across ${index.fileCount} files (keyword-only, no embedding API key configured) in ${Date.now() - buildStart}ms`,
  };
}

/**
 * Cosine similarity between two vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA > 0 && normB > 0 ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
}

/**
 * Semantic search over the codebase.
 * Uses embeddings if the index has them, otherwise falls back to keyword matching.
 */
export async function semanticSearch(
  query: string,
  topK = 8,
): Promise<{
  results: Array<{ file: string; startLine: number; endLine: number; content: string; score: number }>;
  embedded: boolean;
  query: string;
}> {
  const searchStart = Date.now();
  const indexPath = safeResolve(INDEX_FILE);

  let index: SearchIndex;
  try {
    const stat = await fs.stat(indexPath);
    if (indexCache && indexCache.mtimeMs === stat.mtimeMs) {
      index = indexCache.index;
    } else {
      const raw = await fs.readFile(indexPath, "utf-8");
      index = JSON.parse(raw) as SearchIndex;
      indexCache = { index, mtimeMs: stat.mtimeMs };
    }
  } catch {
    return { results: [], embedded: false, query };
  }

  if (index.embeddings.length > 0) {
    // Embedding-based search
    try {
      const embeddingModel = getEmbeddingModel();
      if (!embeddingModel) {
        return keywordSearch(query, index.chunks, topK);
      }

      const { embedding: queryEmbedding } = await embed({
        model: embeddingModel,
        value: query,
      });

      const scored = index.chunks.map((chunk, i) => ({
        ...chunk,
        score: cosineSimilarity(queryEmbedding, index.embeddings[i]),
      }));
      const top = selectTopK(scored, topK * 3, (s) => s.score).filter((s) => s.score > 0.3).slice(0, topK);

      void searchStart;
      return {
        results: top.map((s) => ({
          file: s.file,
          startLine: s.startLine,
          endLine: s.endLine,
          content: s.content.slice(0, 500),
          score: Math.round(s.score * 100) / 100,
        })),
        embedded: true,
        query,
      };
    } catch {
      return keywordSearch(query, index.chunks, topK);
    }
  }

  return keywordSearch(query, index.chunks, topK);
}

function keywordSearch(
  query: string,
  chunks: CodeChunk[],
  topK: number,
): { results: Array<{ file: string; startLine: number; endLine: number; content: string; score: number }>; embedded: boolean; query: string } {
  const lowerQuery = query.toLowerCase();
  const terms = lowerQuery.split(/\s+/).filter((t) => t.length > 1);

  const scored = chunks.map((chunk) => {
    const lowerContent = chunk.content.toLowerCase();
    let score = 0;

    // Exact match bonus
    if (lowerContent.includes(lowerQuery)) score += 5;

    // Individual term matches
    for (const term of terms) {
      const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      const matches = lowerContent.match(regex);
      if (matches) score += matches.length;
    }

    // File name match bonus
    if (chunk.file.toLowerCase().includes(terms[0] || "")) score += 3;

    return { ...chunk, score };
  });

  const top = selectTopK(scored, topK * 3, (s) => s.score).filter((s) => s.score > 0).slice(0, topK);

  return {
    results: top.map((s) => ({
      file: s.file,
      startLine: s.startLine,
      endLine: s.endLine,
      content: s.content.slice(0, 500),
      score: s.score,
    })),
    embedded: false,
    query,
  };
}
