import { describe, expect, it } from "vitest";
import {
  isShareToken,
  previewStatusLabel,
  toPublicSocialPreview,
} from "@/lib/social/post-share";
import type { ContentItem } from "@/lib/types";

function item(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: "c1",
    title: "Internal working title",
    channel: ["LinkedIn", "Instagram"],
    content_type: "Social",
    owner: "Sophie",
    due_date: "2026-10-12",
    deadline_date: null,
    status: "draft",
    category: "Campaign",
    priority: "High",
    website: "https://internal.example",
    caption: "<p>Hello from the yard.</p>",
    theme_id: "theme-1",
    planable_url: "https://app.planable.io/secret",
    planable_post_id: "plan-1",
    planable_group_id: "group-1",
    planable_page_ids: ["page-1"],
    last_synced_at: null,
    sync_source: "hub",
    asset_url: "https://cdn.example/post.jpg\nhttps://www.canva.com/design/abc/view",
    notes: "Do not send the rate card.",
    share_token: "abcdefghij1234567890ab",
    share_enabled: true,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("toPublicSocialPreview", () => {
  it("returns the social mock and omits internal fields", () => {
    const preview = toPublicSocialPreview(item());
    expect(preview).toEqual({
      title: "Internal working title",
      platforms: ["LinkedIn", "Instagram"],
      caption: "Hello from the yard.",
      captionHtml: "<p>Hello from the yard.</p>",
      images: ["https://cdn.example/post.jpg"],
      canvaUrl: "https://www.canva.com/design/abc/view",
      dueDate: "2026-10-12",
      previewStatus: "Draft",
    });
    expect(JSON.stringify(preview)).not.toContain("planable");
    expect(JSON.stringify(preview)).not.toContain("rate card");
    expect(JSON.stringify(preview)).not.toContain("Sophie");
  });

  it("stays closed when the link is off or the token is weak", () => {
    expect(toPublicSocialPreview(item({ share_enabled: false }))).toBeNull();
    expect(toPublicSocialPreview(item({ share_token: "short" }))).toBeNull();
    expect(
      toPublicSocialPreview(item({ content_type: "Editorial", channel: ["Editorial"] }))
    ).toBeNull();
  });

  it("labels scheduled and published posts without the workflow status", () => {
    expect(previewStatusLabel("review")).toBe("Draft");
    expect(previewStatusLabel("approved")).toBe("Draft");
    expect(previewStatusLabel("scheduled")).toBe("Scheduled");
    expect(previewStatusLabel("published")).toBe("Published");
  });
});

describe("isShareToken", () => {
  it("accepts url-safe tokens only", () => {
    expect(isShareToken("abcdefghij1234567890ab")).toBe(true);
    expect(isShareToken("has space-and-more-chars")).toBe(false);
    expect(isShareToken("../etc/passwd-extra")).toBe(false);
  });
});
