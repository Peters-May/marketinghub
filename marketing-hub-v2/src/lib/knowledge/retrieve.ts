import type { KnowledgeAudience } from "@/lib/knowledge/audience";
import { assertPublicAudience } from "@/lib/knowledge/audience";
import { chunkPlainText } from "@/lib/knowledge/chunk";

export type RetrievableDoc = {
  id: string;
  title: string;
  body: string;
  source_url?: string;
  audience?: KnowledgeAudience;
};

export type RetrievedChunk = {
  docId: string;
  title: string;
  source_url?: string;
  chunkIndex: number;
  text: string;
  score: number;
};

/** Minimum score to return a match. Below this → empty (no generic fallback). */
export const KNOWLEDGE_MIN_SCORE = 2;

function queryWords(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((w) => w.length > 2)
    .slice(0, 12);
}

function scoreText(query: string, words: string[], text: string, title: string): number {
  const hay = `${title}\n${text}`.toLowerCase();
  let score = 0;
  for (const w of words) {
    if (hay.includes(w)) score += 1;
  }
  const titleLower = title.toLowerCase();
  for (const w of words) {
    if (w.length > 3 && titleLower.includes(w)) score += 1.5;
  }
  // Light synonym / route boosts for yacht transport questions
  if (
    /\b(yacht|boat|vessel)\b/.test(query.toLowerCase()) &&
    /\b(yacht|transport|shipping|sail)\b/.test(hay)
  ) {
    score += 1;
  }
  if (
    /\b(caribbean|antigua|genoa|mediterranean|florida|lauderdale)\b/.test(
      query.toLowerCase()
    ) &&
    /\b(caribbean|atlantic|mediterranean|florida|usa|europe|route|sailing)\b/.test(
      hay
    )
  ) {
    score += 1;
  }
  return score;
}

/**
 * Hybrid lexical retrieval over document chunks.
 * Returns empty when nothing clears the relevance threshold — callers must not invent answers.
 */
export function retrieveKnowledgeChunks(
  query: string,
  docs: RetrievableDoc[],
  options?: {
    audience?: KnowledgeAudience;
    limit?: number;
    minScore?: number;
  }
): RetrievedChunk[] {
  const audience = options?.audience ?? "public";
  if (audience === "public") assertPublicAudience(audience);

  const filtered = docs.filter((d) => {
    if (!d.audience) return audience === "public";
    return d.audience === audience;
  });

  const words = queryWords(query);
  if (words.length === 0) return [];

  const minScore = options?.minScore ?? KNOWLEDGE_MIN_SCORE;
  const limit = options?.limit ?? 4;
  const scored: RetrievedChunk[] = [];

  for (const doc of filtered) {
    const chunks = chunkPlainText(doc.body);
    for (const chunk of chunks) {
      const score = scoreText(query, words, chunk.text, doc.title);
      if (score < minScore) continue;
      scored.push({
        docId: doc.id,
        title: doc.title,
        source_url: doc.source_url,
        chunkIndex: chunk.index,
        text: chunk.text.slice(0, 2500),
        score,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.chunkIndex - b.chunkIndex);
  // One best chunk per document first, then fill
  const seen = new Set<string>();
  const picked: RetrievedChunk[] = [];
  for (const row of scored) {
    if (seen.has(row.docId)) continue;
    seen.add(row.docId);
    picked.push(row);
    if (picked.length >= limit) return picked;
  }
  for (const row of scored) {
    if (picked.includes(row)) continue;
    picked.push(row);
    if (picked.length >= limit) break;
  }
  return picked;
}
