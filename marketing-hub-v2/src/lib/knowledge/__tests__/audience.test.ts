import { describe, expect, it } from "vitest";
import {
  assertPublicAudience,
  isKnowledgeAudience,
} from "@/lib/knowledge/audience";

describe("knowledge audience", () => {
  it("accepts public and internal only", () => {
    expect(isKnowledgeAudience("public")).toBe(true);
    expect(isKnowledgeAudience("internal")).toBe(true);
    expect(isKnowledgeAudience("shared")).toBe(false);
  });

  it("blocks internal access on the public assert helper", () => {
    expect(() => assertPublicAudience("public")).not.toThrow();
    expect(() => assertPublicAudience("internal")).toThrow(
      /cannot access internal/
    );
  });
});
