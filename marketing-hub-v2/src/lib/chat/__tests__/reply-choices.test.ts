import { describe, expect, it } from "vitest";
import { extractReplyChoices } from "@/lib/chat/reply-choices";

describe("extractReplyChoices", () => {
  it("reads an explicit choices line and hides it from the reply", () => {
    const result = extractReplyChoices(
      "Which route is this?\n[[choices: Yacht transport | Commercial freight | Something else]]"
    );
    expect(result.body).toBe("Which route is this?");
    expect(result.choices).toEqual([
      "Yacht transport",
      "Commercial freight",
      "Something else",
    ]);
  });

  it("infers yacht, freight, or something else from the question", () => {
    const result = extractReplyChoices(
      "Thank you. Could you please specify whether you're looking to transport a yacht, commercial freight, or something else?"
    );
    expect(result.choices).toEqual([
      "Yacht",
      "Commercial freight",
      "Something else",
    ]);
  });

  it("leaves open questions as free type", () => {
    const result = extractReplyChoices(
      "Where is the yacht now, and what is the destination?"
    );
    expect(result.choices).toEqual([]);
    expect(result.body).toContain("Where is the yacht now");
  });
});
