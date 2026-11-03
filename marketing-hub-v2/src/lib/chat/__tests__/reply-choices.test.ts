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

  it("adds yacht/freight chips when the model asks what they want to ship", () => {
    const result = extractReplyChoices(
      "Thank you for your interest in a quote. Could you please let me know what you are looking to ship, and from where to where?"
    );
    expect(result.choices).toEqual([
      "Yacht transport",
      "Freight or cargo",
      "Something else",
    ]);
  });

  it("adds trailer/water/ashore chips for yacht status questions", () => {
    const result = extractReplyChoices(
      "Thanks, I can help get this to the right team. Is the yacht on a trailer, in the water, or ashore in a yard?"
    );
    expect(result.choices).toEqual([
      "Trailer",
      "In the water",
      "Ashore in a yard",
    ]);
  });
});
