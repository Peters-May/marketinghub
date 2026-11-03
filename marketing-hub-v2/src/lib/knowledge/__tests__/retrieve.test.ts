import { describe, expect, it } from "vitest";
import {
  KNOWLEDGE_MIN_SCORE,
  retrieveKnowledgeChunks,
} from "@/lib/knowledge/retrieve";
import { retrieveKb } from "@/lib/chat/rag";
import { chunkPlainText, contentHash } from "@/lib/knowledge/chunk";

describe("knowledge retrieve", () => {
  const docs = [
    {
      id: "1",
      title: "Yacht shipping Mediterranean to Caribbean",
      body: "Peters & May moves yachts between the Mediterranean and the Caribbean on scheduled sailings and bespoke routings. Genoa and Antigua are common ports of call for yacht transport.",
      source_url: "https://www.petersandmay.com/yacht-transport/",
      audience: "public" as const,
    },
    {
      id: "2",
      title: "Careers",
      body: "Join our team in Southampton and offices worldwide.",
      source_url: "https://www.petersandmay.com/careers/",
      audience: "public" as const,
    },
  ];

  it("finds relevant yacht route content without exact port pair wording", () => {
    const chunks = retrieveKnowledgeChunks(
      "Can you move a yacht from Genoa to Antigua?",
      docs,
      { audience: "public", minScore: KNOWLEDGE_MIN_SCORE }
    );
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.docId).toBe("1");
  });

  it("returns nothing instead of a generic fallback when nothing matches", () => {
    const chunks = retrieveKnowledgeChunks(
      "What is the price of bananas in Reykjavik?",
      docs,
      { audience: "public", minScore: KNOWLEDGE_MIN_SCORE }
    );
    expect(chunks).toEqual([]);
    expect(
      retrieveKb("What is the price of bananas in Reykjavik?", docs as never)
    ).toEqual([]);
  });

  it("chunks long text and hashes content", () => {
    const long = "Paragraph one.\n\n".repeat(200);
    const chunks = chunkPlainText(long);
    expect(chunks.length).toBeGreaterThan(1);
    expect(contentHash("abc")).toBe(contentHash("abc"));
    expect(contentHash("abc")).not.toBe(contentHash("abd"));
  });
});
