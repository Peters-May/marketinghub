import { describe, expect, it } from "vitest";
import {
  analyseMentionText,
  highlightParts,
  mentionMatchNote,
  textContainsKeywordPhrase,
} from "@/lib/pr/mention-match";
import { newsApiExternalId, newsApiKeywordQuery } from "@/lib/pr/monitor-fetch";

const keywords = "Peters & May, Peters and May";

describe("analyseMentionText", () => {
  it("treats the brand name as one phrase", () => {
    const match = analyseMentionText(
      "Peters and May moved the yacht from Genoa.",
      keywords
    );
    expect(match.kind).toBe("phrase");
    expect(match.phrases).toContain("Peters and May");
  });

  it("accepts an ampersand as the same phrase", () => {
    expect(
      textContainsKeywordPhrase(
        "Coverage of Peters & May in the trade press.",
        keywords
      )
    ).toBe(true);
  });

  it("keeps a NewsAPI hit that wrote the name without an ampersand", () => {
    expect(
      textContainsKeywordPhrase("Peters May moved the yacht from Genoa.", keywords)
    ).toBe(true);
  });

  it("does not treat a longer name as the brand", () => {
    expect(
      textContainsKeywordPhrase("Peters & Mayfair opened a shop.", keywords)
    ).toBe(false);
  });

  it("does not treat Peters plus the verb may as the brand", () => {
    const match = analyseMentionText(
      "There are several reasons why Peters may not be the next Foreign Minister.",
      keywords
    );
    expect(match.kind).toBe("word");
    expect(match.words.map((word) => word.toLowerCase())).toEqual([
      "peters",
      "may",
    ]);
  });
});

describe("highlightParts", () => {
  it("marks the whole brand name", () => {
    const parts = highlightParts("Peters & May opened a route.", keywords);
    expect(parts.filter((part) => part.match).map((part) => part.text)).toEqual([
      "Peters & May",
    ]);
  });

  it("marks the separate words that caused a loose match", () => {
    const parts = highlightParts(
      "Peters may not be the next Foreign Minister.",
      keywords
    );
    expect(parts.filter((part) => part.match).map((part) => part.text)).toEqual([
      "Peters",
      "may",
    ]);
  });
});

describe("mentionMatchNote", () => {
  it("stays quiet when the brand name is visible", () => {
    expect(
      mentionMatchNote(keywords, "Peters & May", "A logistics note.")
    ).toBeNull();
  });

  it("explains a loose word match", () => {
    expect(
      mentionMatchNote(
        keywords,
        "If it’s not Winston Peters, then who?",
        "Peters may not be the next Foreign Minister."
      )
    ).toMatch(/does not appear together/);
  });

  it("keeps two articles on the same site", () => {
    const first = newsApiExternalId("https://www.tradewindsnews.com/story-one");
    const second = newsApiExternalId("https://www.tradewindsnews.com/story-two");
    expect(first).not.toBe(second);
    expect(first.startsWith("newsapi:")).toBe(true);
  });

  it("searches the brand name with and without the ampersand", () => {
    expect(newsApiKeywordQuery(keywords)).toBe(
      '"Peters & May" OR "Peters and May" OR "Peters May"'
    );
  });

  it("explains when nothing visible matched", () => {
    expect(
      mentionMatchNote(
        keywords,
        "NETFLIX Ax Is Coming as Stock Languishes",
        "Reports have suggested cuts in the 5 percent range."
      )
    ).toMatch(/not shown here/);
  });
});
