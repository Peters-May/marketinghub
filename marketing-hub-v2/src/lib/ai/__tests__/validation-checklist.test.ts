/**
 * Golden-path checklist encoded as unit assertions where live Hub login is unavailable.
 * Live E2E against marketing.petersandmay.com / WP widget remains blocked until staff auth
 * and (separately approved) public plugin go-live.
 */
import { describe, expect, it } from "vitest";
import { searchHubHowTo, howToForPath } from "@/lib/ai/hub-how-to";
import { retrieveKnowledgeChunks } from "@/lib/knowledge/retrieve";
import { assistantModeAllowedForRole } from "@/lib/ai/assistant-shared";
import { shouldSkipSiteKbDeactivation } from "@/lib/chat/sync-site-knowledge";

describe("validation checklist (offline)", () => {
  it("how do I create a campaign / add event cost / page awareness", () => {
    expect(searchHubHowTo("How do I create a campaign?")[0]?.href).toMatch(
      /email|reports/
    );
    expect(searchHubHowTo("How do I add an event cost?")[0]?.id).toBe(
      "add-event-cost"
    );
    expect(howToForPath("/app/events")?.label).toBe("Events");
  });

  it("online chat unknown question does not invent via empty retrieval", () => {
    const chunks = retrieveKnowledgeChunks(
      "What is the secret launch date of Project Zephyr?",
      [
        {
          id: "1",
          title: "Offices",
          body: "Peters & May has offices worldwide.",
          audience: "public",
        },
      ],
      { audience: "public" }
    );
    expect(chunks).toEqual([]);
  });

  it("role restrictions on assistant modes", () => {
    expect(assistantModeAllowedForRole("draft_email", "staff")).toBe(false);
    expect(assistantModeAllowedForRole("chat", "staff")).toBe(true);
  });

  it("incomplete sitemap sync will not mass-deactivate", () => {
    expect(
      shouldSkipSiteKbDeactivation({
        discoveredCount: 0,
        activeCount: 400,
        staleCount: 400,
      }).skip
    ).toBe(true);
  });
});
