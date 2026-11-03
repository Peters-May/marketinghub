import { createHash } from "crypto";

export type KnowledgeChunk = {
  index: number;
  text: string;
};

const DEFAULT_SIZE = 1200;
const DEFAULT_OVERLAP = 150;

/** Split plain text into overlapping chunks for retrieval. */
export function chunkPlainText(
  body: string,
  options?: { size?: number; overlap?: number }
): KnowledgeChunk[] {
  const size = options?.size ?? DEFAULT_SIZE;
  const overlap = options?.overlap ?? DEFAULT_OVERLAP;
  const text = body.replace(/\r\n/g, "\n").trim();
  if (!text) return [];
  if (text.length <= size) return [{ index: 0, text }];

  const chunks: KnowledgeChunk[] = [];
  let start = 0;
  let index = 0;
  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    if (end < text.length) {
      const slice = text.slice(start, end);
      const breakAt = Math.max(
        slice.lastIndexOf("\n\n"),
        slice.lastIndexOf(". "),
        slice.lastIndexOf("\n")
      );
      if (breakAt > size * 0.4) {
        end = start + breakAt + 1;
      }
    }
    const part = text.slice(start, end).trim();
    if (part) chunks.push({ index, text: part });
    index += 1;
    if (end >= text.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks;
}

export function contentHash(body: string): string {
  return createHash("sha256").update(body).digest("hex").slice(0, 40);
}
