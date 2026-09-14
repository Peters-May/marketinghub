import {
  createContent,
  deleteContent,
  listContent,
  updateContent,
  withContentPlanableDefaults,
} from "@/lib/data/repos";
import {
  imageAssetUrls,
  isSocialContentItem,
  joinAssetUrls,
  normalizeChannels,
} from "@/lib/data/normalize";
import { plainTextFromHtml } from "@/lib/plain-text";
import type { ContentItem, ContentStatus } from "@/lib/types";
import {
  archivePlanablePost,
  createPlanablePost,
  dueDateFromScheduledAt,
  facebookPageId,
  getPlanableConfig,
  getPlanablePost,
  hubStatusFromPlanable,
  listAllPlanablePosts,
  listPlanableGroupPosts,
  listPlanablePages,
  planableDeepLink,
  scheduledAtFromDueDate,
  titleFromPlanableMediaUrls,
  mediaFingerprintFromUrls,
  updatePlanablePost,
  type PlanableRawPost,
} from "@/lib/planable/client";

export type PlanableSyncResult = {
  configured: boolean;
  created: number;
  updated: number;
  skipped: number;
  lockedPublished: number;
  removed: number;
  error?: string;
  openUrl: string;
};

type PostGroup = {
  key: string;
  groupId: string;
  posts: PlanableRawPost[];
};

export function groupKey(post: PlanableRawPost): string {
  if (post.groupId) return `g:${post.groupId}`;
  const day = dueDateFromScheduledAt(post.scheduledAt) ?? "";
  const text = post.plainText
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 180);
  if (text && day) return `t:${text}|${day}`;
  const media = mediaFingerprintFromUrls(post.mediaUrls);
  if (media && day) return `m:${media}|${day}`;
  return `id:${post.id}`;
}

function groupMediaDayKey(posts: PlanableRawPost[]): string {
  const day =
    dueDateFromScheduledAt(
      posts.map((p) => p.scheduledAt).find(Boolean) ?? null
    ) ?? "";
  const media = mediaFingerprintFromUrls(posts.flatMap((p) => p.mediaUrls));
  if (!day || !media) return "";
  return `${media}|${day}`;
}

/** Merge platform orphans that share the same video/image + day into one group. */
function consolidatePlanableGroups(groups: PostGroup[]): PostGroup[] {
  const byMediaDay = new Map<string, PostGroup[]>();
  const passthrough: PostGroup[] = [];
  for (const group of groups) {
    const key = groupMediaDayKey(group.posts);
    if (!key) {
      passthrough.push(group);
      continue;
    }
    const list = byMediaDay.get(key) ?? [];
    list.push(group);
    byMediaDay.set(key, list);
  }
  const merged: PostGroup[] = [];
  for (const [, siblings] of byMediaDay) {
    if (siblings.length === 1) {
      merged.push(siblings[0]);
      continue;
    }
    const captions = new Set(
      siblings
        .map((g) =>
          captionFromGroup(g.posts)
            .toLowerCase()
            .replace(/\s+/g, " ")
            .slice(0, 180)
        )
        .filter(Boolean)
    );
    // Different captions on the same file are different posts — keep separate.
    if (captions.size > 1) {
      merged.push(...siblings);
      continue;
    }
    const preferred =
      siblings.find((g) => g.groupId) ||
      siblings.find((g) => g.posts.some((p) => p.plainText.trim())) ||
      siblings[0];
    const seen = new Set<string>();
    const uniquePosts = siblings.flatMap((g) => g.posts).filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
    merged.push({
      key: preferred.key,
      groupId:
        preferred.groupId ||
        uniquePosts.find((p) => p.groupId)?.groupId ||
        "",
      posts: uniquePosts,
    });
  }
  return [...passthrough, ...merged];
}

export function groupPlanablePosts(posts: PlanableRawPost[]): PostGroup[] {
  const map = new Map<string, PlanableRawPost[]>();
  for (const post of posts) {
    if (post.archived) continue;
    const key = groupKey(post);
    if (!key) continue;
    const list = map.get(key) ?? [];
    list.push(post);
    map.set(key, list);
  }
  const groups = Array.from(map.entries()).map(([key, groupPosts]) => ({
    key,
    groupId: groupPosts.find((p) => p.groupId)?.groupId || "",
    posts: groupPosts,
  }));
  return consolidatePlanableGroups(groups);
}

function captionFromGroup(posts: PlanableRawPost[]): string {
  const withText = posts.find((p) => p.plainText.trim());
  return (withText?.plainText || "").trim();
}

function titleFromCaption(caption: string): string {
  const line = caption.split(/\n/)[0]?.trim() || "";
  return line ? line.slice(0, 120) : "";
}

function assetUrlList(assetUrl: string): string[] {
  return assetUrl
    .split(/\n+/)
    .map((u) => u.trim())
    .filter(Boolean);
}

/** True when Hub title is a placeholder or was derived from a media filename. */
export function isReplaceablePlanableTitle(title: string, assetUrl: string): boolean {
  const t = title.trim();
  if (!t) return true;
  if (/^(untitled post|reel|video post|story)$/i.test(t)) return true;
  const fromMedia = titleFromPlanableMediaUrls(assetUrlList(assetUrl));
  return Boolean(fromMedia && fromMedia.toLowerCase() === t.toLowerCase());
}

export function titleForPlanableGroup(
  caption: string,
  assetUrl: string,
  classificationOrType?: string | null
): string {
  const fromCaption = titleFromCaption(caption);
  if (fromCaption) return fromCaption;
  // Do not use the video filename as the title — members expect the caption.
  const kind = (classificationOrType || "").trim().toLowerCase();
  if (kind.includes("reel")) return "Reel";
  if (kind.includes("story")) return "Story";
  if (
    kind.includes("video") ||
    assetUrlList(assetUrl).some((u) =>
      /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u)
    )
  ) {
    return "Video post";
  }
  return "Untitled post";
}

export function resolveSyncedTitle(
  existingTitle: string | null | undefined,
  nextTitle: string,
  caption: string,
  assetUrl: string
): string {
  const fromCaption = titleFromCaption(caption);
  if (fromCaption) return fromCaption;
  if (isReplaceablePlanableTitle(existingTitle || "", assetUrl)) {
    return nextTitle;
  }
  return (existingTitle || "").trim() || nextTitle;
}

function channelsFromGroup(posts: PlanableRawPost[]): string[] {
  const set = new Set<string>();
  for (const p of posts) {
    const source =
      p.platforms.length > 0
        ? p.platforms
        : p.pageName
          ? [p.pageName]
          : [];
    for (const ch of source) {
      for (const c of normalizeChannels([ch])) set.add(c);
    }
  }
  return Array.from(set);
}

/**
 * Prefer one page's media set — Planable gives each platform its own CDN
 * copies of the same assets, so unioning FB+IG+LI triples (or worse) the list.
 * Prefer sets that include an image thumb (video calendar preview).
 */
function mediaFromGroup(posts: PlanableRawPost[]): string {
  let best: string[] = [];
  let bestScore = -1;
  for (const p of posts) {
    const urls = (p.mediaUrls || []).map((u) => u.trim()).filter(Boolean);
    const hasImage = urls.some((u) =>
      /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(u)
    );
    const score = urls.length * 10 + (hasImage ? 5 : 0);
    if (score > bestScore) {
      best = urls;
      bestScore = score;
    }
  }
  return joinAssetUrls(best);
}

function findAllExistingForGroup(
  content: ContentItem[],
  group: PostGroup
): ContentItem[] {
  const postIds = new Set(group.posts.map((p) => p.id));
  const mediaDay = groupMediaDayKey(group.posts);
  const seen = new Set<string>();
  const out: ContentItem[] = [];
  const push = (item: ContentItem | undefined) => {
    if (!item || seen.has(item.id)) return;
    seen.add(item.id);
    out.push(item);
  };

  for (const c of content) {
    if (!isSocialContentItem(c)) continue;
    if (c.planable_post_id && postIds.has(c.planable_post_id)) {
      push(c);
      continue;
    }
    if (group.groupId && c.planable_group_id === group.groupId) {
      push(c);
      continue;
    }
    if (
      mediaDay &&
      !c.planable_group_id &&
      groupMediaDayKeyFromHub(c) === mediaDay
    ) {
      push(c);
    }
  }

  for (const p of group.posts) {
    push(
      content.find(
        (c) =>
          c.planable_url &&
          (c.planable_url.includes(p.id) ||
            (p.url && c.planable_url.includes(p.url)))
      )
    );
  }

  return out;
}

function groupMediaDayKeyFromHub(item: ContentItem): string {
  const day = (item.due_date || "").slice(0, 10);
  const media = mediaFingerprintFromUrls(assetUrlList(item.asset_url || ""));
  if (!day || !media) return "";
  return `${media}|${day}`;
}

function hubDuplicateScore(item: ContentItem): number {
  const captionLen = (item.caption || "").length;
  const channelLen = Array.isArray(item.channel)
    ? item.channel.join(",").length
    : String(item.channel || "").length;
  const assetLen = (item.asset_url || "").length;
  const hasGroup = item.planable_group_id ? 50 : 0;
  const updated = Date.parse(item.updated_at || "") || 0;
  return captionLen * 4 + channelLen + assetLen + hasGroup + updated / 1e12;
}

export function isHubDirty(item: ContentItem): boolean {
  if (item.sync_source !== "hub") return false;
  if (!item.last_synced_at) return true;
  return (
    new Date(item.updated_at).getTime() > new Date(item.last_synced_at).getTime()
  );
}

/** Hub Approved (`review`) or Scheduled sends social to Planable. */
export function shouldPushSocialToPlanable(item: ContentItem): boolean {
  if (!isSocialContentItem(item)) return false;
  return (
    item.status === "review" ||
    item.status === "approved" ||
    item.status === "scheduled"
  );
}

/** Map Planable status onto Hub; always promote Approved → Scheduled when Planable schedules. */
export function inboundStatusForExisting(
  existing: ContentStatus,
  mapped: ContentStatus
): ContentStatus {
  if (existing === "cancelled") return "cancelled";
  if (mapped === "published") return "published";
  // Planable schedule wins over Hub Approved/review.
  if (mapped === "scheduled") return "scheduled";
  if (
    mapped === "draft" &&
    (existing === "review" ||
      existing === "approved" ||
      existing === "scheduled")
  ) {
    return existing === "approved" ? "review" : existing;
  }
  return mapped;
}

/** Pull Planable → Hub social ContentItems. */
export async function syncPlanableIntoHub(): Promise<PlanableSyncResult> {
  const config = getPlanableConfig();
  // Always fresh — Sync from Planable must not serve a 120s cached list.
  const listed = await listAllPlanablePosts({ cache: "no-store" });
  if (!listed.configured) {
    return {
      configured: false,
      created: 0,
      updated: 0,
      skipped: 0,
      lockedPublished: 0,
      removed: 0,
      openUrl: listed.openUrl,
      error: listed.error,
    };
  }
  if (listed.error && listed.posts.length === 0) {
    return {
      configured: true,
      created: 0,
      updated: 0,
      skipped: 0,
      lockedPublished: 0,
      removed: 0,
      openUrl: listed.openUrl,
      error: listed.error,
    };
  }

  const existing = (await listContent()).map(withContentPlanableDefaults);
  const groups = groupPlanablePosts(listed.posts);
  const activePostIds = new Set(
    listed.posts.filter((p) => !p.archived).map((p) => p.id)
  );
  const activeGroupIds = new Set(
    groups.map((g) => g.groupId).filter(Boolean)
  );
  const archivedPostIds = new Set(
    listed.posts.filter((p) => p.archived).map((p) => p.id)
  );
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let lockedPublished = 0;
  let removed = 0;
  const now = new Date().toISOString();

  for (const group of groups) {
    const primary =
      group.posts.find((p) => p.plainText.trim()) || group.posts[0];
    if (!primary) {
      skipped += 1;
      continue;
    }

    const published = group.posts.some((p) => p.published);
    const approved = group.posts.some((p) => p.approved);
    const scheduledSet = group.posts.some((p) => p.scheduledSet);
    const caption = captionFromGroup(group.posts);
    const channels = channelsFromGroup(group.posts);
    const due_date = dueDateFromScheduledAt(
      group.posts.map((p) => p.scheduledAt).find(Boolean) ?? null
    );
    const asset_url = mediaFromGroup(group.posts);
    if (!caption && !asset_url) {
      skipped += 1;
      continue;
    }
    const pageIds = Array.from(
      new Set(
        group.posts.flatMap((p) =>
          p.groupPageIds.length
            ? p.groupPageIds
            : p.pageId
              ? [p.pageId]
              : []
        )
      )
    );
    const status = hubStatusFromPlanable({
      published,
      approved,
      scheduledAt: primary.scheduledAt,
      scheduledSet,
    });
    const planable_url =
      primary.url || planableDeepLink(primary.id, config);
    const nextTitle = titleForPlanableGroup(
      caption,
      asset_url,
      primary.classification || primary.type || primary.platforms[0]
    );

    const matches = findAllExistingForGroup(existing, group);
    const match =
      matches.length > 0
        ? [...matches].sort(
            (a, b) => hubDuplicateScore(b) - hubDuplicateScore(a)
          )[0]
        : undefined;
    if (match) {
      // Collapse historical Hub duplicates for this Planable group/post.
      for (const extra of matches) {
        if (extra.id === match.id) continue;
        await deleteContent(extra.id);
        const idx = existing.findIndex((c) => c.id === extra.id);
        if (idx >= 0) existing.splice(idx, 1);
        removed += 1;
      }
      if (published) lockedPublished += 1;

      // Hub edits must not block Planable schedule/publish from reaching members.
      // Always flip Hub Approved → Scheduled (or Published) when Planable says so.
      if (isHubDirty(match) && !published) {
        if (
          status === "scheduled" &&
          (match.status === "review" ||
            match.status === "approved" ||
            match.status === "scheduled" ||
            match.status === "draft" ||
            match.status === "idea")
        ) {
          const patch: Record<string, unknown> = {
            status: "scheduled",
            due_date: due_date ?? match.due_date,
            planable_url: planable_url || match.planable_url,
            planable_post_id: primary.id,
            planable_group_id: group.groupId || match.planable_group_id,
            planable_page_ids: pageIds.length
              ? pageIds
              : match.planable_page_ids,
            last_synced_at: now,
            sync_source: "planable",
          };
          patch.title = resolveSyncedTitle(
            match.title,
            nextTitle,
            caption || match.caption || "",
            asset_url || match.asset_url || ""
          );
          // Refresh media when Hub has none, or Planable now includes a thumb.
          if (
            asset_url &&
            (!match.asset_url ||
              (!/\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(match.asset_url) &&
                /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(asset_url)))
          ) {
            patch.asset_url = asset_url;
          }
          await updateContent(match.id, patch);
          updated += 1;
          continue;
        }
        // Still refresh ids / Untitled titles / thumbs; leave Hub caption/status alone.
        const soft: Record<string, unknown> = {};
        if (
          !match.planable_post_id ||
          match.planable_post_id !== primary.id
        ) {
          soft.planable_post_id = primary.id;
          soft.planable_group_id = group.groupId || match.planable_group_id;
          soft.planable_page_ids = pageIds.length
            ? pageIds
            : match.planable_page_ids;
          soft.planable_url = match.planable_url || planable_url;
        }
        const softTitle = resolveSyncedTitle(
          match.title,
          nextTitle,
          caption || match.caption || "",
          asset_url || match.asset_url || ""
        );
        if (softTitle !== (match.title || "").trim()) {
          soft.title = softTitle;
        }
        if (
          asset_url &&
          (!match.asset_url ||
            (!/\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(match.asset_url) &&
              /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(asset_url)))
        ) {
          soft.asset_url = asset_url;
        }
        if (Object.keys(soft).length) {
          await updateContent(match.id, soft);
          updated += 1;
        } else {
          skipped += 1;
        }
        continue;
      }

      await updateContent(match.id, {
        title: resolveSyncedTitle(
          match.title,
          nextTitle,
          caption || match.caption || "",
          asset_url || match.asset_url || ""
        ),
        caption: caption || match.caption,
        channel: channels.length ? channels : match.channel,
        content_type: "Social",
        due_date: due_date ?? match.due_date,
        status: inboundStatusForExisting(
          match.status,
          published ? "published" : status
        ),
        asset_url: asset_url || match.asset_url,
        planable_url: planable_url || match.planable_url,
        planable_post_id: primary.id,
        planable_group_id: group.groupId || match.planable_group_id,
        planable_page_ids: pageIds,
        last_synced_at: now,
        sync_source: "planable",
      });
      updated += 1;
      continue;
    }

    const item = await createContent({
      title: nextTitle,
      channel: channels.length ? channels : ["Social"],
      content_type: "Social",
      owner: "",
      due_date,
      deadline_date: null,
      status: published ? "published" : status,
      category: "",
      priority: "",
      website: "",
      caption,
      theme_id: null,
      planable_url,
      planable_post_id: primary.id,
      planable_group_id: group.groupId,
      planable_page_ids: pageIds,
      last_synced_at: now,
      sync_source: "planable",
      asset_url,
      notes: "",
    });
    existing.push(item);
    created += 1;
    if (published) lockedPublished += 1;
  }

  // Remove Hub social rows whose Planable posts were archived or deleted.
  const linked = (await listContent())
    .map(withContentPlanableDefaults)
    .filter(
      (c) =>
        isSocialContentItem(c) &&
        Boolean(c.planable_post_id || c.planable_group_id)
    );

  for (const item of linked) {
    const postId = item.planable_post_id;
    const groupId = item.planable_group_id;

    if (postId && archivedPostIds.has(postId)) {
      await deleteContent(item.id);
      removed += 1;
      continue;
    }

    if (postId && activePostIds.has(postId)) continue;
    if (groupId && activeGroupIds.has(groupId)) continue;

    // Not in this sync page — verify live status (avoid false deletes outside window).
    if (postId) {
      const remote = await getPlanablePost(postId);
      if (
        !remote.ok &&
        (remote.notFound || /not found|404/i.test(remote.error))
      ) {
        await deleteContent(item.id);
        removed += 1;
        continue;
      }
      if (remote.ok && remote.post.archived) {
        await deleteContent(item.id);
        removed += 1;
      }
    }
  }

  // Final pass: collapse any remaining Hub rows that still share a Planable id/group.
  const after = (await listContent()).map(withContentPlanableDefaults);
  const byPost = new Map<string, ContentItem[]>();
  const byGroup = new Map<string, ContentItem[]>();
  for (const item of after) {
    if (!isSocialContentItem(item)) continue;
    if (item.planable_post_id) {
      const list = byPost.get(item.planable_post_id) ?? [];
      list.push(item);
      byPost.set(item.planable_post_id, list);
    }
    if (item.planable_group_id) {
      const list = byGroup.get(item.planable_group_id) ?? [];
      list.push(item);
      byGroup.set(item.planable_group_id, list);
    }
  }
  const alreadyRemoved = new Set<string>();
  const collapse = async (rows: ContentItem[]) => {
    if (rows.length < 2) return;
    const keep = [...rows].sort(
      (a, b) => hubDuplicateScore(b) - hubDuplicateScore(a)
    )[0];
    for (const extra of rows) {
      if (extra.id === keep.id || alreadyRemoved.has(extra.id)) continue;
      await deleteContent(extra.id);
      alreadyRemoved.add(extra.id);
      removed += 1;
    }
  };
  for (const rows of byPost.values()) await collapse(rows);
  for (const rows of byGroup.values()) {
    await collapse(rows.filter((r) => !alreadyRemoved.has(r.id)));
  }

  return {
    configured: true,
    created,
    updated,
    skipped,
    lockedPublished,
    removed,
    openUrl: listed.openUrl,
    ...(listed.error ? { error: listed.error } : {}),
  };
}

/** Archive linked Planable post(s) when a Hub piece is deleted (primary + group siblings). */
export async function removeContentFromPlanable(
  item: ContentItem
): Promise<{ ok: boolean; error?: string }> {
  const current = withContentPlanableDefaults(item);
  if (!current.planable_post_id && !current.planable_group_id) {
    return { ok: true };
  }

  const config = getPlanableConfig();
  if (!config.configured) {
    // Cannot reach Planable — allow Hub delete without remote archive.
    return { ok: true };
  }

  const ids = new Set<string>();
  if (current.planable_post_id) ids.add(current.planable_post_id);

  if (current.planable_group_id) {
    try {
      const siblings = await listPlanableGroupPosts(current.planable_group_id);
      for (const post of siblings) {
        if (!post.published) ids.add(post.id);
      }
    } catch (e) {
      return {
        ok: false,
        error:
          e instanceof Error
            ? e.message
            : "Failed to list Planable group posts for archive.",
      };
    }
  }

  if (!ids.size) return { ok: true };

  const errors: string[] = [];
  for (const id of ids) {
    const result = await archivePlanablePost(id);
    if (!result.ok) errors.push(result.error);
  }
  if (errors.length) {
    return {
      ok: false,
      error:
        errors.length === 1
          ? errors[0]
          : `Failed to archive ${errors.length} Planable posts: ${errors[0]}`,
    };
  }
  return { ok: true };
}

function htmlToPlanableText(html: string): string {
  if (!html.trim()) return "";
  if (!html.includes("<")) return html.trim();
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/p\s*>/gi, "\n")
    .replace(/<\s*\/div\s*>/gi, "\n")
    .replace(/<\s*\/h[1-6]\s*>/gi, "\n")
    .replace(/<\s*\/li\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pushableCaption(item: ContentItem): string {
  const caption = htmlToPlanableText(item.caption || "");
  if (caption) return caption;
  const notes = htmlToPlanableText(item.notes || "");
  if (notes) return notes;
  const fallback = plainTextFromHtml(item.caption || item.notes || "").trim();
  if (fallback) return fallback;
  return (item.title || "").trim();
}

function hubHostedMediaUrls(urls: string[]): string[] {
  return urls.filter((url) => /supabase\.co\/storage\//i.test(url));
}

function isPlanableRateLimit(error: string): boolean {
  return /too many requests|rate limit|429/i.test(error);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function updatePlanablePostWithRetry(
  postId: string,
  patch: {
    plainText?: string;
    scheduledAt?: string | null;
    media?: string[];
  }
): Promise<
  | { ok: true; post?: PlanableRawPost }
  | { ok: false; notFound?: boolean; error: string }
> {
  let lastError = "Planable update failed";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await updatePlanablePost(postId, patch);
    if (result.ok) return result;
    lastError = result.error;
    if (result.notFound || !isPlanableRateLimit(result.error)) return result;
    await sleep(700 * (attempt + 1));
  }
  return { ok: false, error: lastError };
}

async function patchPlanableContent(
  postId: string,
  input: {
    plainText: string;
    scheduledAt: string | null;
    mediaUrls: string[];
    includeMedia?: boolean;
  }
): Promise<
  | { ok: true; mediaApplied: boolean }
  | { ok: false; notFound?: boolean; error: string }
> {
  const includeMedia = input.includeMedia !== false;
  const hubMedia = includeMedia ? hubHostedMediaUrls(input.mediaUrls) : [];
  const mediaAttempts: Array<string[] | undefined> = includeMedia
    ? [
        input.mediaUrls.length ? input.mediaUrls : undefined,
        hubMedia.length ? hubMedia : undefined,
        undefined,
      ]
    : [undefined];
  const seen = new Set<string>();
  let lastError = "Planable update failed";
  for (const media of mediaAttempts) {
    const key = media?.join("\n") ?? "";
    if (seen.has(key)) continue;
    seen.add(key);
    const result = await updatePlanablePostWithRetry(postId, {
      plainText: input.plainText,
      scheduledAt: input.scheduledAt,
      ...(media?.length ? { media } : {}),
    });
    if (result.ok) return { ok: true, mediaApplied: Boolean(media?.length) };
    if (result.notFound) return result;
    // Extra media variants only make rate limits worse.
    if (isPlanableRateLimit(result.error)) return result;
    lastError = result.error;
  }
  return { ok: false, error: lastError };
}

async function linkHubToPlanablePost(
  item: ContentItem,
  post: { id: string; groupId: string | null },
  pageId: string,
  now: string
): Promise<ContentItem> {
  const patched = await updateContent(item.id, {
    planable_post_id: post.id,
    planable_group_id: post.groupId || "",
    planable_page_ids: [pageId],
    planable_url: planableDeepLink(post.id),
    last_synced_at: now,
    sync_source: "hub",
  });
  return patched ?? item;
}

/** Push a Hub social ContentItem to Planable (create or update). */
export async function pushContentToPlanable(
  item: ContentItem
): Promise<{ item: ContentItem; error?: string }> {
  let current = withContentPlanableDefaults(item);
  if (!shouldPushSocialToPlanable(current)) {
    return { item: current };
  }

  const config = getPlanableConfig();
  if (!config.configured) {
    return {
      item: current,
      error: "Planable is not configured.",
    };
  }

  const pagesResult = await listPlanablePages();
  if (!pagesResult.configured || pagesResult.pages.length === 0) {
    return {
      item: current,
      error: pagesResult.error || "No Planable pages available.",
    };
  }

  // One Facebook page only — 3 LinkedIn pages would use 3 allowance slots.
  const pageId = facebookPageId(pagesResult.pages);
  if (!pageId) {
    return {
      item: current,
      error:
        "No Facebook page found in Planable. Hub sends one Facebook draft so you can add LinkedIn and Instagram there.",
    };
  }

  const plainText = pushableCaption(current);
  const scheduledAt = scheduledAtFromDueDate(current.due_date);
  const mediaUrls = imageAssetUrls(current.asset_url).slice(0, 20);

  if (!plainText && !mediaUrls.length) {
    return {
      item: current,
      error:
        "Add a caption or image before sending to Planable. Empty drafts still use your post allowance.",
    };
  }

  const now = new Date().toISOString();
  const caption = plainText || "Untitled post";
  let effectiveScheduledAt = scheduledAt;
  const patchInput = () => ({
    plainText: caption,
    scheduledAt: effectiveScheduledAt,
    mediaUrls,
  });

  if (current.planable_post_id) {
    let result = await patchPlanableContent(
      current.planable_post_id,
      patchInput()
    );
    // Same-day approve after 09:00 UTC used to fail; bump and retry once.
    if (
      !result.ok &&
      /schedule date must be in the future/i.test(result.error)
    ) {
      effectiveScheduledAt = new Date(Date.now() + 15 * 60_000).toISOString();
      result = await patchPlanableContent(
        current.planable_post_id,
        patchInput()
      );
    }
    if (result.ok) {
      const groupId = current.planable_group_id;
      if (groupId) {
        const siblings = (await listPlanableGroupPosts(groupId)).filter(
          (p) => p.id !== current.planable_post_id && !p.published
        );
        // One at a time, text+date only — parallel media updates trip Planable rate limits.
        for (const post of siblings) {
          const siblingResult = await patchPlanableContent(post.id, {
            ...patchInput(),
            includeMedia: false,
          });
          if (!siblingResult.ok) {
            console.error("[planable] group sibling update failed", {
              id: current.id,
              postId: post.id,
              error: siblingResult.error,
            });
            if (isPlanableRateLimit(siblingResult.error)) break;
          }
        }
      }
      const patched = await updateContent(current.id, {
        planable_url:
          current.planable_url || planableDeepLink(current.planable_post_id),
        last_synced_at: now,
        sync_source: "hub",
      });
      return {
        item: patched ?? current,
        ...(!result.mediaApplied && mediaUrls.length
          ? {
              error:
                "Caption reached Planable, but the images were rejected. Check the Planable post and try again.",
            }
          : {}),
      };
    }
    if (/publish/i.test(result.error)) {
      const locked = await updateContent(current.id, {
        status: "published",
        sync_source: "planable",
        last_synced_at: now,
      });
      return {
        item: locked ?? current,
        error: "Post is published in Planable and is locked in the Hub.",
      };
    }
    if (!result.notFound && !/not found|404/i.test(result.error)) {
      return { item: current, error: result.error };
    }
    // Stale Planable id (deleted/archived) — create a new post below.
    current = {
      ...current,
      planable_post_id: "",
      planable_url: "",
      planable_group_id: "",
      planable_page_ids: [],
    };
  }

  // Reuse an existing draft instead of creating another allowance slot.
  const listed = await listAllPlanablePosts({
    maxPosts: 200,
    cache: "no-store",
  });
  const due = dueDateFromScheduledAt(effectiveScheduledAt);
  const existing = listed.posts.find(
    (p) =>
      !p.archived &&
      p.plainText.trim() === caption &&
      dueDateFromScheduledAt(p.scheduledAt) === due
  );
  if (existing) {
    await patchPlanableContent(existing.id, patchInput());
    return {
      item: await linkHubToPlanablePost(current, existing, pageId, now),
    };
  }

  let created = await createPlanablePost({
    pageId,
    plainText: caption,
    scheduledAt: effectiveScheduledAt,
    ...(mediaUrls.length ? { media: mediaUrls } : {}),
  });
  if (
    !created.ok &&
    /schedule date must be in the future/i.test(created.error)
  ) {
    effectiveScheduledAt = new Date(Date.now() + 15 * 60_000).toISOString();
    created = await createPlanablePost({
      pageId,
      plainText: caption,
      scheduledAt: effectiveScheduledAt,
      ...(mediaUrls.length ? { media: mediaUrls } : {}),
    });
  }
  if (!created.ok) {
    return {
      item: current,
      error: created.error || "Failed to create Planable draft.",
    };
  }

  return {
    item: await linkHubToPlanablePost(current, created.post, pageId, now),
  };
}
