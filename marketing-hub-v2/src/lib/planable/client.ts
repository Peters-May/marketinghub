import { PLATFORM_META, platformKey } from "@/lib/social/platforms";
import type { ContentStatus } from "@/lib/types";

export const PLANABLE_API_BASE_URL = "https://api.planable.io/api/v1";

/** Enough coverage for calendar + inbound sync. */
const PLANABLE_PAGE_SIZE = 100;
const PLANABLE_MAX_POSTS = 500;

export function getPlanableConfig() {
  const token = process.env.PLANABLE_API_TOKEN;
  const workspaceId = process.env.PLANABLE_WORKSPACE_ID;
  const appUrl = process.env.PLANABLE_APP_URL || "https://app.planable.io";
  return {
    configured: Boolean(token && workspaceId),
    token,
    workspaceId,
    appUrl,
    openUrl: workspaceId ? `${appUrl}/w/${workspaceId}` : appUrl,
  };
}

export type PlanablePage = {
  id: string;
  name: string | null;
  platform: string | null;
};

export type PlanablePost = {
  id: string;
  text: string;
  status: string;
  scheduledAt: string | null;
  url: string | null;
  pageName: string | null;
  mediaUrl: string | null;
  mediaUrls: string[];
  platforms: string[];
  /** Cross-network sibling group in Planable (multi-platform = one Hub card). */
  groupId: string | null;
};

/** Raw Planable post shape used by sync (keeps ids / group / published). */
export type PlanableRawPost = {
  id: string;
  workspaceId: string;
  pageId: string | null;
  groupId: string | null;
  groupPageIds: string[];
  plainText: string;
  scheduledAt: string | null;
  published: boolean;
  approved: boolean;
  /** True when a real schedule was set in Planable (not just a default date). */
  scheduledSet: boolean;
  archived: boolean;
  mediaUrls: string[];
  platforms: string[];
  pageName: string | null;
  url: string | null;
  type: string | null;
  /** Planable classification: post | reels | story | … */
  classification: string | null;
};

function authHeaders(token: string, json = false): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function isVideoMediaUrl(url: string): boolean {
  return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url);
}

function isImageMediaUrl(url: string): boolean {
  return (
    /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(url) ||
    (!isVideoMediaUrl(url) && !/\.pdf(\?|$)/i.test(url) && /image/i.test(url))
  );
}

/**
 * One display URL per image (prefer full file over thumbnail CDN variant).
 * For videos keep cover/thumbnail + file once each so the calendar can preview.
 */
function pushMediaItem(
  out: string[],
  item: {
    url?: string;
    thumbnailUrl?: string;
    thumbnail?: string;
    type?: string;
    mediaType?: string;
  }
) {
  const push = (u: string | null | undefined) => {
    const s = (u ?? "").trim();
    if (s && !out.includes(s)) out.push(s);
  };
  const url = (item.url ?? "").trim();
  const thumb = (item.thumbnailUrl || item.thumbnail || "").trim();
  const typeHint = `${item.type || ""} ${item.mediaType || ""}`;
  const looksVideo =
    isVideoMediaUrl(url) ||
    (!url && isVideoMediaUrl(thumb)) ||
    /video|reel/i.test(typeHint);

  if (looksVideo) {
    if (thumb && !isVideoMediaUrl(thumb)) push(thumb);
    if (url) push(url);
    else if (thumb) push(thumb);
    return;
  }

  // Images / documents: never store both thumb + full (Planable CDN duplicates).
  if (url) push(url);
  else if (thumb) push(thumb);
}

function pickMediaUrls(p: Record<string, unknown>): string[] {
  const out: string[] = [];
  const push = (u: string | null | undefined) => {
    const s = (u ?? "").trim();
    if (s && !out.includes(s)) out.push(s);
  };

  const media = p.media;
  if (typeof media === "string") push(media);
  else if (Array.isArray(media)) {
    for (const item of media) {
      if (typeof item === "string") push(item);
      else if (item && typeof item === "object") {
        pushMediaItem(
          out,
          item as {
            url?: string;
            thumbnailUrl?: string;
            thumbnail?: string;
            type?: string;
            mediaType?: string;
          }
        );
      }
    }
  }

  const attachments = p.attachments as
    | Array<
        | {
            url?: string;
            thumbnail?: string;
            thumbnailUrl?: string;
            type?: string;
            mediaType?: string;
          }
        | string
      >
    | undefined;
  if (Array.isArray(attachments)) {
    for (const item of attachments) {
      if (typeof item === "string") push(item);
      else if (item && typeof item === "object") {
        pushMediaItem(out, item);
      }
    }
  }

  const hasImage = out.some((u) => isImageMediaUrl(u));
  const hasVideo = out.some((u) => isVideoMediaUrl(u));

  // Cover/thumbnail: always useful for video-only posts; otherwise only when empty
  // so carousels do not duplicate the first slide as a resized cover.
  if (out.length === 0 || (hasVideo && !hasImage)) {
    push(p.videoThumbnailUrl as string | undefined);
    push(p.thumbnailUrl as string | undefined);
    push(p.thumbnail as string | undefined);
    push(p.imageUrl as string | undefined);
    push(p.coverUrl as string | undefined);
  }
  return out;
}

/** Stable media identity for grouping orphans (empty caption, no groupId). */
export function mediaFingerprintFromUrls(urls: string[]): string {
  const ordered = [
    ...urls.filter((u) => isVideoMediaUrl(u)),
    ...urls.filter((u) => !isVideoMediaUrl(u)),
  ];
  for (const raw of ordered) {
    try {
      const path = new URL(raw).pathname;
      const file = decodeURIComponent(path.split("/").pop() || "");
      if (!file) continue;
      let base = file.replace(/\.[a-z0-9]+$/i, "");
      base = base
        .replace(/_transcoded$/i, "")
        .replace(/_web-?\d+p$/i, "")
        .replace(/_pintura[a-f0-9]+$/i, "")
        .replace(/_\d{5}(\.\d+)?$/i, "");
      base = base.replace(/^[A-Za-z0-9]{8,}-/, "");
      const stem = base
        .toLowerCase()
        .replace(/[_-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .trim();
      if (stem.length < 3) continue;
      if (/^(thumb(nail)?|cover|preview|untitled|image|video|media)$/i.test(stem)) {
        continue;
      }
      return stem.slice(0, 120);
    } catch {
      /* ignore */
    }
  }
  return "";
}

/** Humanize a Planable media filename when the post has no caption. */
export function titleFromPlanableMediaUrls(urls: string[]): string {
  const stem = mediaFingerprintFromUrls(urls);
  if (!stem) return "";
  return stem
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 120);
}

function pickPlatforms(
  p: Record<string, unknown>,
  pagesById: Map<string, PlanablePage>
): string[] {
  const collected: string[] = [];
  const push = (raw: string | null | undefined) => {
    if (raw == null) return;
    const s = String(raw).trim();
    if (!s) return;
    // Post content types are not platforms
    if (/^(post|story|reel|video|carousel|image)$/i.test(s)) return;
    collected.push(s);
  };

  push(p.platform as string | undefined);
  push(p.type as string | undefined);

  const pages = p.pages as
    | Array<{ name?: string; type?: string; platform?: string }>
    | undefined;
  if (Array.isArray(pages)) {
    for (const x of pages) {
      push(x.platform || x.type || x.name);
    }
  }

  // Use this post's page only — groupPageIds would paint every sibling with
  // every network icon and make member-calendar duplicates look identical.
  const pageId = p.pageId != null ? String(p.pageId) : null;
  if (pageId) {
    const page = pagesById.get(pageId);
    if (page) {
      push(page.platform);
      if (!page.platform) push(page.name);
    }
  }

  const pageName =
    (p.pageName as string | undefined) ||
    (p.page as { name?: string } | undefined)?.name;
  if (collected.length === 0) push(pageName);

  // Dedupe by resolved platform key (keep first label per network)
  const seen = new Set<string>();
  const out: string[] = [];
  for (const label of collected) {
    const key = platformKey(label);
    if (key === "social") {
      if (out.length === 0) out.push(label);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

export function platformLabelFromPlanable(platform: string | null): string {
  if (!platform) return "Social";
  const key = platformKey(platform);
  return PLATFORM_META[key].label;
}

export async function listPlanablePages(): Promise<{
  configured: boolean;
  pages: PlanablePage[];
  openUrl: string;
  error?: string;
}> {
  const config = getPlanableConfig();
  if (!config.configured || !config.token || !config.workspaceId) {
    return {
      configured: false,
      pages: [],
      openUrl: config.openUrl,
      error: "Set PLANABLE_API_TOKEN and PLANABLE_WORKSPACE_ID to sync posts.",
    };
  }
  const map = await fetchPlanablePages(config.token, config.workspaceId);
  return {
    configured: true,
    pages: Array.from(map.values()),
    openUrl: config.openUrl,
  };
}

async function fetchPlanablePages(
  token: string,
  workspaceId: string
): Promise<Map<string, PlanablePage>> {
  const map = new Map<string, PlanablePage>();
  try {
    const res = await fetch(
      `${PLANABLE_API_BASE_URL}/pages?workspaceId=${encodeURIComponent(workspaceId)}&limit=100`,
      {
        headers: authHeaders(token),
        next: { revalidate: 300 },
      }
    );
    if (!res.ok) return map;
    const data = (await res.json()) as {
      data?: Array<Record<string, unknown>>;
    };
    for (const page of data.data ?? []) {
      const id = page.id != null ? String(page.id) : "";
      if (!id) continue;
      map.set(id, {
        id,
        name: page.name != null ? String(page.name) : null,
        platform:
          page.platform != null
            ? String(page.platform)
            : page.type != null
              ? String(page.type)
              : null,
      });
    }
  } catch {
    /* pages optional */
  }
  return map;
}

function preferConnectedPage(candidates: PlanablePage[]): PlanablePage | undefined {
  if (candidates.length <= 1) return candidates[0];
  const named = candidates.find((p) =>
    /peters\s*[&+]\s*may/i.test(p.name ?? "")
  );
  return named ?? candidates[0];
}

/** Hub only creates on Facebook (one page = one allowance). Add LinkedIn/IG in Planable. */
export function facebookPageId(pages: PlanablePage[]): string | null {
  const facebook = pages.filter(
    (p) => platformKey(p.platform ?? p.name ?? "") === "facebook"
  );
  return preferConnectedPage(facebook)?.id ?? null;
}

function pickGroupId(p: Record<string, unknown>): string | null {
  if (p.groupId != null && String(p.groupId)) return String(p.groupId);
  const group = p.group;
  if (group && typeof group === "object" && !Array.isArray(group)) {
    const id = (group as { id?: unknown }).id;
    if (id != null && String(id)) return String(id);
  }
  return null;
}

function pickGroupPageIds(
  p: Record<string, unknown>,
  pageId: string | null
): string[] {
  const fromPost = Array.isArray(p.groupPageIds)
    ? (p.groupPageIds as unknown[]).map(String).filter(Boolean)
    : [];
  const group = p.group;
  const fromGroup =
    group && typeof group === "object" && !Array.isArray(group)
      ? Array.isArray((group as { pageIds?: unknown }).pageIds)
        ? ((group as { pageIds: unknown[] }).pageIds).map(String).filter(Boolean)
        : []
      : [];
  const ids = Array.from(new Set([...fromPost, ...fromGroup]));
  if (ids.length) return ids;
  return pageId ? [pageId] : [];
}

function toRawPost(
  p: Record<string, unknown>,
  pagesById: Map<string, PlanablePage>
): PlanableRawPost {
  const id = String(p.id ?? p._id ?? "");
  const pageId = p.pageId != null ? String(p.pageId) : null;
  const groupId = pickGroupId(p);
  const groupPageIds = pickGroupPageIds(p, pageId);
  const scheduled =
    (p.scheduledAt as string | undefined) ||
    (p.scheduled_at as string | undefined) ||
    (p.publishAt as string | undefined) ||
    null;
  const platforms = pickPlatforms(p, pagesById).map(platformLabelFromPlanable);
  const page = pageId ? pagesById.get(pageId) : undefined;
  return {
    id,
    workspaceId: String(p.workspaceId ?? ""),
    pageId,
    groupId,
    groupPageIds,
    plainText: String(
      p.plainText ?? p.text ?? p.caption ?? p.title ?? ""
    ).trim(),
    scheduledAt: scheduled,
    published: p.published === true,
    approved: p.approved === true,
    scheduledSet: Boolean(
      p.scheduledSet === true ||
        p.scheduledSet === "true" ||
        (p as { scheduled_set?: unknown }).scheduled_set === true
    ),
    archived: p.archived === true,
    mediaUrls: pickMediaUrls(p),
    platforms:
      platforms.length > 0
        ? platforms
        : page?.platform
          ? [platformLabelFromPlanable(page.platform)]
          : [],
    pageName: page?.name ?? null,
    url: (p.url as string | undefined) ?? null,
    type: p.type != null ? String(p.type) : null,
    classification:
      p.classification != null ? String(p.classification) : null,
  };
}

async function fetchRawPostsPage(
  token: string,
  workspaceId: string,
  offset: number,
  limit: number,
  cache: RequestCache = "force-cache"
): Promise<{
  posts: Array<Record<string, unknown>>;
  hasMore: boolean;
  error?: string;
}> {
  const res = await fetch(
    `${PLANABLE_API_BASE_URL}/posts?workspaceId=${encodeURIComponent(workspaceId)}&limit=${limit}&offset=${offset}`,
    {
      headers: authHeaders(token),
      cache,
      ...(cache === "force-cache" ? { next: { revalidate: 120 } } : {}),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    return {
      posts: [],
      hasMore: false,
      error: `Planable API ${res.status}: ${text.slice(0, 200)}`,
    };
  }
  const data = (await res.json()) as {
    data?: Array<Record<string, unknown>>;
    posts?: Array<Record<string, unknown>>;
    pagination?: { hasMore?: boolean };
  };
  const batch = data.data ?? data.posts ?? [];
  return {
    posts: batch,
    hasMore: Boolean(data.pagination?.hasMore) && batch.length > 0,
  };
}

export async function listAllPlanablePosts(options?: {
  maxPosts?: number;
  cache?: RequestCache;
}): Promise<{
  configured: boolean;
  posts: PlanableRawPost[];
  pages: PlanablePage[];
  openUrl: string;
  error?: string;
}> {
  const config = getPlanableConfig();
  const maxPosts = options?.maxPosts ?? PLANABLE_MAX_POSTS;
  const cache = options?.cache ?? "force-cache";
  if (!config.configured || !config.token || !config.workspaceId) {
    return {
      configured: false,
      posts: [],
      pages: [],
      openUrl: config.openUrl,
      error: "Set PLANABLE_API_TOKEN and PLANABLE_WORKSPACE_ID to sync posts.",
    };
  }

  try {
    const pagesById = await fetchPlanablePages(
      config.token,
      config.workspaceId
    );
    const rawPosts: Array<Record<string, unknown>> = [];
    let offset = 0;
    let error: string | undefined;

    while (rawPosts.length < maxPosts) {
      const limit = Math.min(PLANABLE_PAGE_SIZE, maxPosts - rawPosts.length);
      const page = await fetchRawPostsPage(
        config.token,
        config.workspaceId,
        offset,
        limit,
        cache
      );
      if (page.error) {
        error = page.error;
        break;
      }
      rawPosts.push(...page.posts);
      if (!page.hasMore) break;
      offset += page.posts.length;
    }

    return {
      configured: true,
      posts: rawPosts
        .filter((p) => p.id != null)
        .map((p) => toRawPost(p, pagesById)),
      pages: Array.from(pagesById.values()),
      openUrl: config.openUrl,
      ...(error ? { error } : {}),
    };
  } catch (e) {
    return {
      configured: true,
      posts: [],
      pages: [],
      openUrl: config.openUrl,
      error: e instanceof Error ? e.message : "Planable fetch failed",
    };
  }
}

export async function fetchPlanablePosts(): Promise<{
  configured: boolean;
  posts: PlanablePost[];
  openUrl: string;
  error?: string;
}> {
  const result = await listAllPlanablePosts({ maxPosts: 300 });
  return {
    configured: result.configured,
    posts: result.posts.map((p) => {
      // Caption only — never promote the video/image filename into calendar text.
      const fromText = p.plainText.trim().slice(0, 280);
      const kind = `${p.classification || ""} ${p.type || ""}`.toLowerCase();
      const fallback = kind.includes("reel")
        ? "Reel"
        : kind.includes("story")
          ? "Story"
          : p.mediaUrls.some((u) => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u))
            ? "Video post"
            : "Untitled post";
      return {
        id: p.id,
        text: fromText || fallback,
        status: (() => {
          const hub = hubStatusFromPlanable(p);
          if (hub === "published") return "Published";
          if (hub === "scheduled") return "Scheduled";
          if (hub === "review" || hub === "approved") return "Approved";
          return "Draft";
        })(),
        scheduledAt: p.scheduledAt,
        url: p.url,
        pageName: p.pageName,
        mediaUrl:
          p.mediaUrls.find((u) => isImageMediaUrl(u)) ??
          p.mediaUrls[0] ??
          null,
        mediaUrls: p.mediaUrls,
        platforms: p.platforms,
        groupId: p.groupId,
      };
    }),
    openUrl: result.openUrl,
    ...(result.error ? { error: result.error } : {}),
  };
}

function extractPostFromResponse(json: unknown): Record<string, unknown> | null {
  if (!json || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;
  if (obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)) {
    return obj.data as Record<string, unknown>;
  }
  if (Array.isArray(obj.data) && obj.data[0]) {
    return obj.data[0] as Record<string, unknown>;
  }
  if (obj.id != null) return obj;
  return null;
}

export async function createPlanablePost(input: {
  pageId: string;
  plainText: string;
  scheduledAt?: string | null;
  media?: string[];
  approved?: boolean;
}): Promise<{ ok: true; post: PlanableRawPost } | { ok: false; error: string }> {
  const config = getPlanableConfig();
  if (!config.configured || !config.token || !config.workspaceId) {
    return { ok: false, error: "Planable is not configured." };
  }

  // Planable rejects create when both pageId and pageIds are sent.
  const body: Record<string, unknown> = {
    workspaceId: config.workspaceId,
    pageIds: [input.pageId],
    text: input.plainText,
  };
  if (input.scheduledAt) {
    // Date on the draft only — never queue auto-publish from Hub.
    body.scheduledAt = input.scheduledAt;
    body.publishAtScheduledDate = false;
  }
  if (input.media?.length) body.media = input.media;
  if (input.approved === true) body.approved = true;

  try {
    const res = await fetch(`${PLANABLE_API_BASE_URL}/posts`, {
      method: "POST",
      headers: authHeaders(config.token, true),
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* ignore */
    }
    if (!res.ok) {
      const err = (json as { error?: { message?: string } } | null)?.error
        ?.message;
      return {
        ok: false,
        error: err || `Planable create ${res.status}: ${text.slice(0, 200)}`,
      };
    }
    const pagesById = await fetchPlanablePages(
      config.token,
      config.workspaceId
    );
    const raw = extractPostFromResponse(json);
    if (raw?.id) {
      return { ok: true, post: toRawPost(raw, pagesById) };
    }

    // 201 with no id — look up the draft instead of creating another later.
    const listed = await listAllPlanablePosts({
      maxPosts: 100,
      cache: "no-store",
    });
    const due = dueDateFromScheduledAt(input.scheduledAt);
    const match = listed.posts.find(
      (p) =>
        !p.archived &&
        p.plainText.trim() === input.plainText.trim() &&
        (p.pageId === input.pageId || p.groupPageIds.includes(input.pageId)) &&
        dueDateFromScheduledAt(p.scheduledAt) === due
    );
    if (match) return { ok: true, post: match };

    return {
      ok: false,
      error:
        "Planable may have created a draft but returned no id. Sync from Planable before approving again so we do not create a duplicate.",
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Planable create failed",
    };
  }
}

export async function listPlanableGroupPosts(
  groupId: string
): Promise<PlanableRawPost[]> {
  if (!groupId) return [];
  const listed = await listAllPlanablePosts({
    maxPosts: PLANABLE_MAX_POSTS,
    cache: "no-store",
  });
  return listed.posts.filter((p) => p.groupId === groupId && !p.archived);
}

export async function updatePlanablePost(
  postId: string,
  patch: {
    plainText?: string;
    scheduledAt?: string | null;
    media?: string[];
    videoThumbnailUrl?: string | null;
    approved?: boolean;
    notify?: boolean;
  }
): Promise<
  | { ok: true; post?: PlanableRawPost }
  | { ok: false; notFound?: boolean; error: string }
> {
  const config = getPlanableConfig();
  if (!config.configured || !config.token || !config.workspaceId) {
    return { ok: false, error: "Planable is not configured." };
  }

  const body: Record<string, unknown> = {
    notify: patch.notify === true,
  };
  if (patch.plainText !== undefined) body.text = patch.plainText;
  if (patch.scheduledAt !== undefined && patch.scheduledAt !== null) {
    // Keep the planned date on the draft; never auto-queue for publish from Hub.
    body.scheduledAt = patch.scheduledAt;
    body.publishAtScheduledDate = false;
  }
  if (patch.media !== undefined) body.media = patch.media;
  if (patch.videoThumbnailUrl) {
    body.videoThumbnail = { imageUrl: patch.videoThumbnailUrl };
  }
  if (patch.approved !== undefined) body.approved = patch.approved;
  const hasFields = Object.keys(body).some((key) => key !== "notify");
  if (!hasFields) {
    return { ok: false, error: "No Planable fields to update." };
  }

  try {
    const res = await fetch(`${PLANABLE_API_BASE_URL}/posts/${postId}`, {
      method: "PATCH",
      headers: authHeaders(config.token, true),
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* ignore */
    }
    if (!res.ok) {
      const err = (json as { error?: { message?: string } } | null)?.error
        ?.message;
      const message =
        err || `Planable update ${res.status}: ${text.slice(0, 200)}`;
      return {
        ok: false,
        ...(res.status === 404 || /not found/i.test(message)
          ? { notFound: true }
          : {}),
        error: message,
      };
    }
    const raw = extractPostFromResponse(json);
    if (raw?.id) {
      const pagesById = await fetchPlanablePages(
        config.token,
        config.workspaceId
      );
      return { ok: true, post: toRawPost(raw, pagesById) };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Planable update failed",
    };
  }
}

export async function getPlanablePost(
  postId: string
): Promise<
  | { ok: true; post: PlanableRawPost }
  | { ok: false; notFound?: boolean; error: string }
> {
  const config = getPlanableConfig();
  if (!config.configured || !config.token || !config.workspaceId) {
    return { ok: false, error: "Planable is not configured." };
  }
  try {
    const res = await fetch(`${PLANABLE_API_BASE_URL}/posts/${postId}`, {
      headers: authHeaders(config.token),
    });
    if (res.status === 404) {
      return { ok: false, notFound: true, error: "Post not found" };
    }
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* ignore */
    }
    if (!res.ok) {
      const err = (json as { error?: { message?: string } } | null)?.error
        ?.message;
      return {
        ok: false,
        error: err || `Planable get ${res.status}: ${text.slice(0, 200)}`,
      };
    }
    const raw = extractPostFromResponse(json);
    if (!raw?.id) {
      return { ok: false, notFound: true, error: "Post not found" };
    }
    const pagesById = await fetchPlanablePages(
      config.token,
      config.workspaceId
    );
    return { ok: true, post: toRawPost(raw, pagesById) };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Planable get failed",
    };
  }
}

/** Archive (preferred) or delete a Planable post — unpublished only for hard deletes. */
export async function archivePlanablePost(
  postId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const config = getPlanableConfig();
  if (!config.configured || !config.token) {
    return { ok: false, error: "Planable is not configured." };
  }

  try {
    const patchRes = await fetch(`${PLANABLE_API_BASE_URL}/posts/${postId}`, {
      method: "PATCH",
      headers: authHeaders(config.token, true),
      body: JSON.stringify({ archived: true }),
    });
    if (patchRes.ok || patchRes.status === 404) {
      return { ok: true };
    }

    const delRes = await fetch(`${PLANABLE_API_BASE_URL}/posts/${postId}`, {
      method: "DELETE",
      headers: authHeaders(config.token),
    });
    if (delRes.ok || delRes.status === 404) {
      return { ok: true };
    }

    const text = await delRes.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* ignore */
    }
    const err = (json as { error?: { message?: string } } | null)?.error
      ?.message;
    return {
      ok: false,
      error: err || `Planable archive/delete ${delRes.status}`,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Planable archive failed",
    };
  }
}

/** Upload media from a public URL into the Planable workspace. */
export async function uploadPlanableMediaFromUrl(
  url: string
): Promise<{ ok: true; mediaUrl: string } | { ok: false; error: string }> {
  const config = getPlanableConfig();
  if (!config.configured || !config.token || !config.workspaceId) {
    return { ok: false, error: "Planable is not configured." };
  }

  const attempts: Array<{ path: string; body: Record<string, unknown> }> = [
    {
      path: `/media`,
      body: { workspaceId: config.workspaceId, url },
    },
    {
      path: `/workspaces/${config.workspaceId}/media`,
      body: { url },
    },
    {
      path: `/media/from-url`,
      body: { workspaceId: config.workspaceId, url },
    },
  ];

  let lastError = "Media upload not supported";
  for (const attempt of attempts) {
    try {
      const res = await fetch(`${PLANABLE_API_BASE_URL}${attempt.path}`, {
        method: "POST",
        headers: authHeaders(config.token, true),
        body: JSON.stringify(attempt.body),
      });
      const text = await res.text();
      let json: unknown = null;
      try {
        json = JSON.parse(text);
      } catch {
        /* ignore */
      }
      if (!res.ok) {
        const err = (json as { error?: { message?: string } } | null)?.error
          ?.message;
        lastError = err || `Planable media ${res.status}`;
        continue;
      }
      const raw = extractPostFromResponse(json) ?? (json as Record<string, unknown>);
      const mediaUrl =
        (raw?.url as string | undefined) ||
        (raw?.mediaUrl as string | undefined) ||
        (typeof raw?.data === "string" ? raw.data : undefined) ||
        url;
      return { ok: true, mediaUrl: String(mediaUrl) };
    } catch (e) {
      lastError = e instanceof Error ? e.message : "Media upload failed";
    }
  }
  return { ok: false, error: lastError };
}

export function hubStatusFromPlanable(post: {
  published: boolean;
  approved: boolean;
  scheduledAt: string | null;
  scheduledSet?: boolean;
}): ContentStatus {
  if (post.published) return "published";
  // Planable "scheduled to publish" → Hub Scheduled (members can see it).
  if (post.scheduledSet === true) return "scheduled";
  // Approved in Planable with a date is treated as scheduled for the Hub.
  if (post.approved && post.scheduledAt) return "scheduled";
  if (post.approved) return "review";
  return "draft";
}

/** Prefer 09:00 UTC on the due day; bump into the near future if that time has passed. */
export function scheduledAtFromDueDate(
  dueDate: string | null | undefined,
  now = new Date()
): string | null {
  if (!dueDate) return null;
  const day = dueDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const preferred = new Date(`${day}T09:00:00.000Z`);
  // Planable rejects create/update when scheduledAt is not in the future.
  if (preferred.getTime() > now.getTime() + 60_000) {
    return preferred.toISOString();
  }
  return new Date(now.getTime() + 15 * 60_000).toISOString();
}

export function dueDateFromScheduledAt(
  scheduledAt: string | null | undefined
): string | null {
  if (!scheduledAt) return null;
  const day = scheduledAt.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

export function planableDeepLink(
  postId: string,
  config = getPlanableConfig()
): string {
  if (!config.workspaceId) return config.openUrl;
  return `${config.appUrl}/w/${config.workspaceId}?postId=${encodeURIComponent(postId)}`;
}
