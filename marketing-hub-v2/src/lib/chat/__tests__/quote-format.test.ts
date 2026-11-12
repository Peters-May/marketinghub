import { describe, expect, it } from "vitest";
import {
  conversationEmailHtml,
  conversationEmailText,
  parseGuidedQuote,
} from "@/lib/chat/quote-format";
import type { ChatMessage } from "@/lib/types";

function msg(
  role: ChatMessage["role"],
  body: string,
  id = "x"
): ChatMessage {
  return {
    id,
    session_id: "s1",
    role,
    body,
    author_name: role === "staff" ? "Alex" : "",
    sources: [],
    attachments: [],
    created_at: "2026-11-12T12:00:00.000Z",
  };
}

const quoteBody = [
  "Yacht transport enquiry (guided form):",
  "",
  "Your name: Sophie Edgerley",
  "Business email: sophie@petersandmay.com",
  "Where are you based? (country or city): Eastleigh",
  "Make and model: Test",
  "Destination: Caribbean",
].join("\n");

describe("parseGuidedQuote", () => {
  it("parses yacht guided form fields", () => {
    const q = parseGuidedQuote(quoteBody);
    expect(q?.kind).toBe("yacht");
    expect(q?.mode).toBe("guided");
    expect(q?.fields).toEqual(
      expect.arrayContaining([
        { label: "Your name", value: "Sophie Edgerley" },
        { label: "Business email", value: "sophie@petersandmay.com" },
        { label: "Destination", value: "Caribbean" },
      ])
    );
  });

  it("parses pasted freight details", () => {
    const q = parseGuidedQuote(
      "Freight / cargo enquiry (pasted details):\n\n2x crates Southampton to Miami"
    );
    expect(q?.kind).toBe("freight");
    expect(q?.mode).toBe("pasted");
    expect(q?.pastedBody).toContain("2x crates");
  });
});

describe("conversation email layout", () => {
  it("keeps chat above/below a quote table", () => {
    const html = conversationEmailHtml([
      msg("assistant", "Would you like to explore more?", "1"),
      msg("visitor", "Yes", "2"),
      msg("visitor", "?", "3"),
      msg("visitor", quoteBody, "4"),
      msg("assistant", "Thank you — the team will review this.", "5"),
    ]);
    expect(html).toContain("Conversation");
    expect(html).toContain("Yes");
    expect(html).toContain("Yacht transport enquiry");
    expect(html).toContain("Sophie Edgerley");
    expect(html).toContain("mailto:sophie@petersandmay.com");
    expect(html).toContain("Thank you — the team will review this.");
    // Quote fields use detail rows, not a flat dump of Label: value only.
    expect(html).toMatch(/<table[\s\S]*Your name[\s\S]*Sophie Edgerley/);
  });

  it("plain text keeps quote as labelled rows", () => {
    const text = conversationEmailText([
      msg("visitor", "Yes", "1"),
      msg("visitor", quoteBody, "2"),
    ]);
    expect(text).toContain("Conversation:");
    expect(text).toContain("- Yes");
    expect(text).toContain("Yacht transport enquiry");
    expect(text).toContain("Your name: Sophie Edgerley");
  });
});
