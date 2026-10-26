import { describe, expect, it } from "vitest";
import { compileEmailDesign } from "@/lib/email/design";
import { pressPitchFromRelease } from "@/lib/pr/pitch-email";
import type { ContentItem } from "@/lib/types";

function release(
  partial: Partial<ContentItem> & Pick<ContentItem, "id" | "title">
): ContentItem {
  return {
    channel: ["PR"],
    content_type: "PR",
    owner: "",
    due_date: "2026-05-22",
    deadline_date: null,
    status: "published",
    category: "press release",
    priority: "",
    website: "",
    caption: "The fleet has arrived.",
    theme_id: null,
    planable_url: "",
    planable_post_id: "",
    planable_group_id: "",
    planable_page_ids: [],
    last_synced_at: null,
    sync_source: "",
    asset_url: "https://cdn.example.com/fleet.jpg",
    notes: "<p>The yachts left Palma on 5 May.</p>",
    pr_boilerplate: "<p>About the company.</p>",
    pr_contact: "Sophie Edgerley\nsophie@petersandmay.com",
    created_at: "2026-05-22T00:00:00.000Z",
    updated_at: "2026-05-22T00:00:00.000Z",
    ...partial,
  };
}

describe("press pitch email", () => {
  it("keeps the newsroom release sections in order", () => {
    const html = compileEmailDesign(
      pressPitchFromRelease(
        release({ id: "cnt_main", title: "Fleet arrives in Newport" }),
        [
          release({
            id: "cnt_other",
            title: "Earlier sponsorship story",
            caption: "A short earlier story.",
          }),
        ],
        "https://hub.example.com"
      )
    );
    const labels = [
      "Press release",
      "Fleet arrives in Newport",
      "Notes for editors",
      "Related articles",
      "About Peters &amp; May",
      "Related media",
      "Related content",
      "Earlier sponsorship story",
      "Contacts",
      "sophie@petersandmay.com",
    ];
    let from = 0;
    for (const label of labels) {
      const at = html.indexOf(label, from);
      expect(at, label).toBeGreaterThan(-1);
      from = at + label.length;
    }
    expect(html).toContain("https://hub.example.com/newsroom/cnt_other");
    expect(html).toContain("https://cdn.example.com/fleet.jpg");
  });
});
