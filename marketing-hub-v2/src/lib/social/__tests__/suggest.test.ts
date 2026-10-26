import { describe, expect, it } from "vitest";
import type { ContentItem } from "@/lib/types";
import {
  canReviseOwnIdea,
  contentVisibleToMember,
  parseSuggestChannels,
  safeAssetUrls,
} from "@/lib/social/suggest";

function item(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: "c1",
    title: "Yard photo",
    channel: ["LinkedIn"],
    content_type: "Social",
    owner: "Alex",
    owner_user_id: "user-alex",
    due_date: null,
    deadline_date: null,
    status: "idea",
    category: "",
    priority: "",
    website: "",
    caption: "A note from the yard.",
    theme_id: null,
    planable_url: "",
    planable_post_id: "",
    planable_group_id: "",
    planable_page_ids: [],
    last_synced_at: null,
    sync_source: "hub",
    asset_url: "",
    notes: "",
    share_token: "secret-token",
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("contentVisibleToMember", () => {
  it("keeps scheduled posts and the member's own ideas", () => {
    const visible = contentVisibleToMember(
      [
        item({ id: "idea", status: "idea", owner_user_id: "user-alex" }),
        item({
          id: "other",
          status: "idea",
          owner_user_id: "user-sam",
          owner: "Sam",
        }),
        item({
          id: "live",
          status: "scheduled",
          due_date: "2026-11-01",
          owner_user_id: "user-sam",
        }),
        item({ id: "draft", status: "draft", owner_user_id: "user-alex" }),
      ],
      "user-alex"
    );
    expect(visible.map((row) => row.id)).toEqual(["idea", "live"]);
    expect(visible[0].share_token).toBeUndefined();
  });
});

describe("canReviseOwnIdea", () => {
  it("allows the owner to revise an undated idea", () => {
    expect(canReviseOwnIdea(item(), "user-alex")).toBe(true);
  });

  it("stops once marketing dates the idea or it is no longer an idea", () => {
    expect(
      canReviseOwnIdea(item({ due_date: "2026-11-02" }), "user-alex")
    ).toBe(false);
    expect(canReviseOwnIdea(item({ status: "draft" }), "user-alex")).toBe(
      false
    );
    expect(canReviseOwnIdea(item(), "user-sam")).toBe(false);
  });
});

describe("parseSuggestChannels", () => {
  it("keeps LinkedIn, Instagram and Facebook only", () => {
    expect(
      parseSuggestChannels(["instagram", "Email", "Facebook", "LinkedIn"])
    ).toEqual(["Instagram", "Facebook", "LinkedIn"]);
  });
});

describe("safeAssetUrls", () => {
  it("keeps upload and https urls", () => {
    expect(
      safeAssetUrls(
        "https://cdn.example/a.jpg\njavascript:alert(1)\n/api/uploads/content/photo.jpg"
      )
    ).toBe("https://cdn.example/a.jpg\n/api/uploads/content/photo.jpg");
  });
});
