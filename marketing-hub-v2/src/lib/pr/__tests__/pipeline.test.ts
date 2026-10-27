import { describe, expect, it } from "vitest";
import { buildPrPipeline } from "@/lib/pr/pipeline";
import type { ContentItem, PrPitch } from "@/lib/types";

function release(
  partial: Partial<ContentItem> & Pick<ContentItem, "id" | "title" | "status">
): ContentItem {
  return {
    channel: ["PR"],
    content_type: "pr",
    owner: "",
    due_date: null,
    deadline_date: null,
    category: "press release",
    priority: "",
    website: "",
    caption: "",
    theme_id: null,
    planable_url: "",
    planable_post_id: "",
    planable_group_id: "",
    planable_page_ids: [],
    last_synced_at: null,
    sync_source: "",
    asset_url: "",
    notes: "",
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    ...partial,
  };
}

describe("PR pipeline", () => {
  it("includes a scheduled release before it is pitched", () => {
    const row = buildPrPipeline({
      content: [
        release({ id: "rel-1", title: "Yard opens", status: "scheduled" }),
      ],
      pitches: [],
      coverage: [],
    })[0];
    expect(row?.stage).toBe("release");
  });

  it("marks a release pitched from an email campaign", () => {
    const row = buildPrPipeline({
      content: [
        release({ id: "rel-1", title: "Yard opens", status: "approved" }),
      ],
      pitches: [],
      coverage: [],
      campaigns: [
        {
          content_id: "rel-1",
          category: "pitch",
          folder: "Press",
          template_id: null,
        },
      ],
    })[0];
    expect(row?.stage).toBe("pitched");
    expect(row?.pitchId).toBeNull();
  });

  it("does not treat a marketing send as a pitch", () => {
    const legacy: PrPitch[] = [];
    const row = buildPrPipeline({
      content: [
        release({ id: "rel-1", title: "Yard opens", status: "published" }),
      ],
      pitches: legacy,
      coverage: [],
      campaigns: [
        {
          content_id: "rel-1",
          category: "marketing",
          folder: "",
          template_id: null,
        },
      ],
    })[0];
    expect(row?.stage).toBe("release");
  });
});
