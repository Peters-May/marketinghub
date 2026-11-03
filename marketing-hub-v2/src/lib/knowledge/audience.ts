/** Knowledge audience — hard boundary between Online Chat and Hub Assistant. */
export type KnowledgeAudience = "public" | "internal";

export function isKnowledgeAudience(value: unknown): value is KnowledgeAudience {
  return value === "public" || value === "internal";
}

/** Online Chat may only retrieve public knowledge. */
export function assertPublicAudience(audience: KnowledgeAudience): void {
  if (audience !== "public") {
    throw new Error("Online Chat cannot access internal knowledge.");
  }
}
