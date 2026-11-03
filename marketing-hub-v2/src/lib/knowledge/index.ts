/**
 * Shared knowledge infrastructure for Online Chat (public) and Hub Assistant (internal).
 * Every retrieve path must pass an audience; public never reads internal docs or Hub tools.
 */
export type { KnowledgeAudience } from "@/lib/knowledge/audience";
export {
  assertPublicAudience,
  isKnowledgeAudience,
} from "@/lib/knowledge/audience";
export { chunkPlainText, contentHash } from "@/lib/knowledge/chunk";
export {
  KNOWLEDGE_MIN_SCORE,
  retrieveKnowledgeChunks,
  type RetrievableDoc,
  type RetrievedChunk,
} from "@/lib/knowledge/retrieve";
