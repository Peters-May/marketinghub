import { describe, expect, it } from "vitest";
import {
  hubStatusFromPlanable,
  scheduledAtFromDueDate,
  dueDateFromScheduledAt,
  type PlanableRawPost,
} from "@/lib/planable/client";
import {
  groupKey,
  groupPlanablePosts,
  inboundStatusForExisting,
  isHubDirty,
  isReplaceablePlanableTitle,
  resolveSyncedTitle,
  shouldPushSocialToPlanable,
  titleForPlanableGroup,
} from "@/lib/planable/sync";
import type { ContentItem } from "@/lib/types";

function rawPost(overrides: Partial<PlanableRawPost> = {}): PlanableRawPost {
  return {
    id: "p1",
    workspaceId: "w1",
    pageId: "page1",
    groupId: null,
    groupPageIds: ["page1"],
    plainText: "Hello world",
    scheduledAt: "2026-09-10T09:00:00.000Z",
    published: false,
    approved: false,
    scheduledSet: false,
    archived: false,
    mediaUrls: [],
    platforms: ["Facebook"],
    pageName: "Peters & May",
    url: null,
    type: "post",
    classification: "post",
    ...overrides,
  };
}

function contentItem(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: "c1",
    title: "Post",
    channel: ["Facebook"],
    content_type: "Social",
    owner: "",
    due_date: "2026-09-10",
    deadline_date: null,
    status: "draft",
    category: "",
    priority: "",
    website: "",
    caption: "Hello",
    theme_id: null,
    planable_url: "",
    planable_post_id: "",
    planable_group_id: "",
    planable_page_ids: [],
    last_synced_at: null,
    sync_source: "",
    asset_url: "",
    notes: "",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("hubStatusFromPlanable", () => {
  it("maps published / scheduledSet / approved+date / draft", () => {
    expect(
      hubStatusFromPlanable({
        published: true,
        approved: false,
        scheduledAt: null,
      })
    ).toBe("published");
    expect(
      hubStatusFromPlanable({
        published: false,
        approved: false,
        scheduledAt: "2026-09-10T09:00:00.000Z",
        scheduledSet: true,
      })
    ).toBe("scheduled");
    expect(
      hubStatusFromPlanable({
        published: false,
        approved: true,
        scheduledAt: "2026-09-10T09:00:00.000Z",
      })
    ).toBe("scheduled");
    expect(
      hubStatusFromPlanable({
        published: false,
        approved: true,
        scheduledAt: null,
      })
    ).toBe("review");
    expect(
      hubStatusFromPlanable({
        published: false,
        approved: false,
        scheduledAt: null,
      })
    ).toBe("draft");
  });
});

describe("inboundStatusForExisting", () => {
  it("lets Planable publish and schedule win", () => {
    expect(inboundStatusForExisting("review", "published")).toBe("published");
    expect(inboundStatusForExisting("review", "scheduled")).toBe("scheduled");
    expect(inboundStatusForExisting("approved", "scheduled")).toBe("scheduled");
  });

  it("keeps Hub review/scheduled when Planable maps to draft", () => {
    expect(inboundStatusForExisting("review", "draft")).toBe("review");
    expect(inboundStatusForExisting("scheduled", "draft")).toBe("scheduled");
    expect(inboundStatusForExisting("approved", "draft")).toBe("review");
  });

  it("keeps Hub cancelled even if Planable maps scheduled or published", () => {
    expect(inboundStatusForExisting("cancelled", "scheduled")).toBe("cancelled");
    expect(inboundStatusForExisting("cancelled", "published")).toBe("cancelled");
    expect(inboundStatusForExisting("cancelled", "draft")).toBe("cancelled");
  });
});

describe("groupPlanablePosts / groupKey", () => {
  it("groups by Planable groupId", () => {
    const posts = [
      rawPost({ id: "a", groupId: "g1", platforms: ["Facebook"] }),
      rawPost({ id: "b", groupId: "g1", platforms: ["Instagram"], pageId: "ig" }),
    ];
    const groups = groupPlanablePosts(posts);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("g:g1");
    expect(groups[0].posts).toHaveLength(2);
  });

  it("groups by text+day when groupId is missing", () => {
    const posts = [
      rawPost({ id: "a", plainText: "Same caption", scheduledAt: "2026-09-10T09:00:00.000Z" }),
      rawPost({ id: "b", plainText: "Same caption", scheduledAt: "2026-09-10T15:00:00.000Z" }),
    ];
    expect(groupKey(posts[0])).toBe(groupKey(posts[1]));
    expect(groupPlanablePosts(posts)).toHaveLength(1);
  });

  it("skips archived posts", () => {
    const groups = groupPlanablePosts([
      rawPost({ id: "a", archived: true }),
      rawPost({ id: "b", plainText: "Live" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].posts[0].id).toBe("b");
  });
});

describe("isHubDirty / shouldPushSocialToPlanable", () => {
  it("is dirty when hub source and updated after last sync", () => {
    expect(
      isHubDirty(
        contentItem({
          sync_source: "hub",
          last_synced_at: "2026-09-01T00:00:00.000Z",
          updated_at: "2026-09-02T00:00:00.000Z",
        })
      )
    ).toBe(true);
    expect(
      isHubDirty(
        contentItem({
          sync_source: "planable",
          last_synced_at: "2026-09-01T00:00:00.000Z",
          updated_at: "2026-09-02T00:00:00.000Z",
        })
      )
    ).toBe(false);
    expect(
      isHubDirty(
        contentItem({
          sync_source: "hub",
          last_synced_at: "2026-09-02T00:00:00.000Z",
          updated_at: "2026-09-02T00:00:00.000Z",
        })
      )
    ).toBe(false);
  });

  it("pushes only social review/approved/scheduled", () => {
    expect(shouldPushSocialToPlanable(contentItem({ status: "review" }))).toBe(
      true
    );
    expect(
      shouldPushSocialToPlanable(contentItem({ status: "approved" }))
    ).toBe(true);
    expect(
      shouldPushSocialToPlanable(contentItem({ status: "scheduled" }))
    ).toBe(true);
    expect(shouldPushSocialToPlanable(contentItem({ status: "draft" }))).toBe(
      false
    );
    expect(
      shouldPushSocialToPlanable(contentItem({ status: "cancelled" }))
    ).toBe(false);
    expect(
      shouldPushSocialToPlanable(
        contentItem({ status: "review", content_type: "Editorial", channel: ["Editorial"] })
      )
    ).toBe(false);
  });
});

describe("scheduledAtFromDueDate / dueDateFromScheduledAt", () => {
  it("prefers 09:00 UTC when still in the future", () => {
    const now = new Date("2026-09-01T08:00:00.000Z");
    expect(scheduledAtFromDueDate("2026-09-10", now)).toBe(
      "2026-09-10T09:00:00.000Z"
    );
  });

  it("bumps into the near future when preferred time has passed", () => {
    const now = new Date("2026-09-10T10:00:00.000Z");
    const scheduled = scheduledAtFromDueDate("2026-09-10", now);
    expect(scheduled).toBe(new Date(now.getTime() + 15 * 60_000).toISOString());
  });

  it("extracts due date day", () => {
    expect(dueDateFromScheduledAt("2026-09-10T09:00:00.000Z")).toBe(
      "2026-09-10"
    );
    expect(dueDateFromScheduledAt(null)).toBeNull();
  });
});

describe("title helpers", () => {
  it("prefers caption over placeholders and media filenames", () => {
    expect(
      titleForPlanableGroup("Launch day\nmore", "", "reels")
    ).toBe("Launch day");
    expect(titleForPlanableGroup("", "", "reels")).toBe("Reel");
    expect(
      titleForPlanableGroup("", "https://cdn.example/video.mp4", "post")
    ).toBe("Video post");
  });

  it("replaces untitled / media-derived titles when caption exists", () => {
    expect(
      resolveSyncedTitle("Untitled post", "Reel", "Real caption", "")
    ).toBe("Real caption");
    expect(
      resolveSyncedTitle("Keep this title", "Reel", "", "")
    ).toBe("Keep this title");
    expect(isReplaceablePlanableTitle("Untitled post", "")).toBe(true);
    expect(isReplaceablePlanableTitle("Custom launch", "")).toBe(false);
  });
});
