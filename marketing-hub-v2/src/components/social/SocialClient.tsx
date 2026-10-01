"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO, startOfDay } from "date-fns";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import { Check, ExternalLink, Send } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { FullCalendarStyles } from "@/components/ui/FullCalendarStyles";
import { FilterBar, matchesSearch } from "@/components/ui/FilterBar";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { RecordDrawer } from "@/components/ui/RecordDrawer";
import { StatusPill } from "@/components/ui/StatusPill";
import { useHubDataRefresh } from "@/lib/command/refresh";
import { cn } from "@/lib/utils";
import { CONTENT_STATUS } from "@/lib/data/collections";
import type { ContentItem, ContentStatus } from "@/lib/types";
import {
  isSocialContentItem,
  normalizeChannels,
  previewAssetUrls,
  primaryCanvaUrl,
  stripHtml,
} from "@/lib/data/normalize";
import {
  PLATFORM_META,
  isCanvaUrl,
  isPreviewableImageUrl,
  isVideoUrl,
  platformKey,
} from "@/lib/social/platforms";
import { titleFromPlanableMediaUrls, mediaFingerprintFromUrls } from "@/lib/planable/client";
import { HUB_CALENDAR_CSS } from "@/components/content/ContentCalendarCard";
import { SocialMonthlyPlan } from "@/components/social/SocialMonthlyPlan";
import { SocialMonthlyTasks } from "@/components/social/SocialMonthlyTasks";
import {
  CompactMultiImageThumb,
  PlatformPostPreview,
} from "@/components/social/PlatformPostPreview";

type SocialPost = {
  id: string;
  text: string;
  /** Original caption/notes HTML for detail panel (Hub). */
  html?: string | null;
  status: string;
  /** Raw Hub status — present on Hub posts so status can be edited. */
  statusValue?: ContentStatus;
  scheduledAt: string | null;
  url: string | null;
  platform: string;
  platforms: string[];
  mediaUrl: string | null;
  mediaUrls: string[];
  source: "planable" | "hub";
  /** Planable cross-post group — used to collapse platform copies in member view. */
  planableGroupId?: string | null;
  /** All Planable sibling ids in the same group (member-view dedupe). */
  planableSiblingIds?: string[];
};

const HUB_STATUS_OPTIONS = CONTENT_STATUS.filter(
  (o) => o.value !== "published"
);

function normalizePlatform(raw: string | null | undefined): string {
  const key = platformKey(raw ?? "");
  return PLATFORM_META[key].label;
}

type PlanableApiPost = {
  id: string;
  text: string;
  status: string;
  scheduledAt: string | null;
  url: string | null;
  pageName: string | null;
  mediaUrl?: string | null;
  mediaUrls?: string[];
  platforms?: string[];
  groupId?: string | null;
};

function planableTextDayKey(text: string, scheduledAt: string | null): string {
  const day = (scheduledAt || "").slice(0, 10);
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 180);
  if (normalized && day) return `t:${normalized}|${day}`;
  return "";
}

function planableMediaDayKey(
  mediaUrls: string[] | undefined,
  mediaUrl: string | null | undefined,
  scheduledAt: string | null
): string {
  const day = (scheduledAt || "").slice(0, 10);
  const urls = [
    ...(mediaUrls || []),
    ...(mediaUrl ? [mediaUrl] : []),
  ].filter(Boolean);
  const media = mediaFingerprintFromUrls(urls);
  if (media && day) return `m:${media}|${day}`;
  return "";
}

function planableMemberGroupKey(p: PlanableApiPost): string {
  if (p.groupId) return `g:${p.groupId}`;
  const byText = planableTextDayKey(p.text || "", p.scheduledAt);
  if (byText) return byText;
  const byMedia = planableMediaDayKey(p.mediaUrls, p.mediaUrl, p.scheduledAt);
  if (byMedia) return byMedia;
  return `id:${p.id}`;
}

function statusRank(status: string): number {
  const s = status.toLowerCase();
  if (s === "published") return 3;
  if (s === "scheduled") return 2;
  if (s === "approved" || s === "review") return 1;
  return 0;
}

/** One calendar card per Planable cross-post group (admin Hub already does this). */
function collapsePlanableForMemberView(raw: PlanableApiPost[]): SocialPost[] {
  const map = new Map<string, PlanableApiPost[]>();
  for (const p of raw) {
    const key = planableMemberGroupKey(p);
    const list = map.get(key) ?? [];
    list.push(p);
    map.set(key, list);
  }

  const mergeBy = (
    keyFn: (siblings: PlanableApiPost[]) => string
  ) => {
    const index = new Map<string, string>();
    for (const [key, siblings] of [...map.entries()]) {
      const mergeKey = keyFn(siblings);
      if (!mergeKey) continue;
      const existing = index.get(mergeKey);
      if (!existing) {
        index.set(mergeKey, key);
        continue;
      }
      if (existing === key) continue;
      const target = map.get(existing);
      if (!target) continue;
      target.push(...siblings);
      map.delete(key);
    }
  };

  // Merge groups that share caption+day or the same media file+day.
  mergeBy((siblings) => {
    const sample = siblings.find((p) => p.text.trim()) || siblings[0];
    return sample
      ? planableTextDayKey(sample.text, sample.scheduledAt)
      : "";
  });
  mergeBy((siblings) => {
    const sample = siblings[0];
    if (!sample) return "";
    const texts = new Set(
      siblings
        .map((p) =>
          (p.text || "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, " ")
            .slice(0, 180)
        )
        .filter(Boolean)
    );
    if (texts.size > 1) return "";
    return planableMediaDayKey(
      siblings.flatMap((p) => p.mediaUrls || []),
      sample.mediaUrl,
      sample.scheduledAt
    );
  });

  return Array.from(map.values()).map((siblings) => {
    const primary =
      siblings.find((p) => p.text.trim()) ||
      [...siblings].sort(
        (a, b) => statusRank(b.status) - statusRank(a.status)
      )[0] ||
      siblings[0];
    const platforms = Array.from(
      new Set(
        siblings.flatMap((p) =>
          (p.platforms?.length
            ? p.platforms
            : p.pageName
              ? [p.pageName]
              : ["Social"]
          ).map(normalizePlatform)
        )
      )
    );
    const mediaUrls = Array.from(
      new Set(
        siblings.flatMap((p) =>
          (p.mediaUrls?.length
            ? p.mediaUrls
            : p.mediaUrl
              ? [p.mediaUrl]
              : []
          ).filter(Boolean)
        )
      )
    );
    const preview = [
      ...mediaUrls.filter(isPreviewableImageUrl),
      ...mediaUrls.filter(isVideoUrl),
    ];
    const bestStatus = [...siblings].sort(
      (a, b) => statusRank(b.status) - statusRank(a.status)
    )[0];
    const groupId =
      siblings.map((s) => s.groupId).find((id) => Boolean(id)) ?? null;
    return {
      id: `pl_${primary.id}`,
      text: stripHtml(primary.text),
      html: null,
      status: normalizeStatus(bestStatus?.status || primary.status),
      scheduledAt: primary.scheduledAt,
      url: primary.url,
      platform: platforms[0] ?? "Social",
      platforms,
      mediaUrl: preview[0] ?? mediaUrls[0] ?? null,
      mediaUrls: preview.length ? preview : mediaUrls,
      source: "planable" as const,
      planableGroupId: groupId,
      planableSiblingIds: siblings.map((s) => s.id),
    };
  });
}

/** Split + normalize channel tags so multi-network posts keep IG/FB/LI separate. */
function platformsFromChannel(
  channel: ContentItem["channel"],
  title?: string,
  notes?: string
): string[] {
  const normalized = normalizeChannels(channel, title ?? "", notes ?? "");
  const labels = normalized.map((ch) => normalizePlatform(ch));
  const unique: string[] = [];
  for (const label of labels) {
    if (!unique.includes(label)) unique.push(label);
  }
  return unique.length ? unique : ["Social"];
}

function normalizeStatus(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes("cancel")) return "Cancelled";
  if (s.includes("publish")) return "Published";
  if (s.includes("schedul")) return "Scheduled";
  if (s.includes("approv") || s.includes("review")) return "Approved";
  if (s.includes("draft")) return "Draft";
  if (s.includes("idea")) return "Idea";
  if (!raw.trim()) return "Draft";
  return raw.trim().replace(/^\w/, (c) => c.toUpperCase());
}

function statusTone(status: string) {
  const s = status.toLowerCase();
  if (s.includes("cancel")) {
    return "bg-slate-100 text-slate-600 border-slate-300";
  }
  if (s.includes("publish") || s.includes("approv")) {
    return "bg-emerald-50 text-emerald-800 border-emerald-200";
  }
  if (s.includes("schedul")) {
    return "bg-sky-50 text-sky-800 border-sky-200";
  }
  if (s.includes("review")) {
    return "bg-amber-50 text-amber-900 border-amber-200";
  }
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function looksLikeHtml(input: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(input);
}

/** Calendar label: caption first; never fall back to a media filename title. */
function hubPostDisplayText(c: {
  caption?: string | null;
  title?: string | null;
  notes?: string | null;
  asset_url?: string | null;
}): string {
  const caption = stripHtml(c.caption || "").trim();
  if (caption) return caption;
  const title = stripHtml(c.title || "").trim();
  const fromMedia = titleFromPlanableMediaUrls(
    (c.asset_url || "")
      .split(/\n+/)
      .map((u) => u.trim())
      .filter(Boolean)
  );
  if (
    title &&
    !/^(untitled post|reel|video post|story)$/i.test(title) &&
    (!fromMedia || fromMedia.toLowerCase() !== title.toLowerCase())
  ) {
    return title;
  }
  const notes = stripHtml(c.notes || "").trim();
  if (notes) return notes;
  if (/\.(mp4|mov|webm|m4v)(\?|$)/i.test(c.asset_url || "")) return "Video post";
  return title || "Untitled post";
}

function PlatformBadge({ name }: { name: string }) {
  const meta = PLATFORM_META[platformKey(name)];
  return (
    <span
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] text-[8px] font-bold leading-none"
      style={{ backgroundColor: meta.bg, color: meta.fg }}
      title={meta.label}
    >
      {meta.short}
    </span>
  );
}

function PostCard({
  post,
  compact = false,
}: {
  post: SocialPost;
  compact?: boolean;
}) {
  const platforms = post.platforms.length
    ? post.platforms
    : [post.platform];
  const images = post.mediaUrls.filter(
    (u) => isPreviewableImageUrl(u) || isVideoUrl(u)
  );
  const canvaUrl =
    images.length === 0 && isCanvaUrl(post.mediaUrl) ? post.mediaUrl : null;
  const time =
    post.scheduledAt && !Number.isNaN(parseISO(post.scheduledAt).getTime())
      ? format(parseISO(post.scheduledAt), "HH:mm")
      : null;
  const showTime = time && time !== "09:00" && time !== "00:00";

  return (
    <div
      className={cn(
        "hub-cal-card flex w-full flex-col overflow-hidden rounded-lg border border-slate-200/90 bg-white text-left shadow-sm",
        compact ? "gap-1 p-1.5" : "gap-1.5 p-2"
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <div className="flex min-w-0 items-center gap-0.5">
          {platforms.map((p) => (
            <PlatformBadge key={p} name={p} />
          ))}
        </div>
        {showTime ? (
          <span className="inline-flex shrink-0 items-center gap-0.5 text-[9px] tabular-nums text-slate-500">
            <Send className="h-2.5 w-2.5" />
            {time}
          </span>
        ) : null}
      </div>

      <CompactMultiImageThumb images={images} canvaUrl={canvaUrl} />

      <p className="line-clamp-2 text-[10px] font-medium leading-snug text-slate-800">
        {post.text || "Untitled post"}
      </p>

      <div className="mt-auto flex items-center">
        <span
          className={cn(
            "inline-flex max-w-full items-center gap-0.5 truncate rounded-full border px-1.5 py-0.5 text-[9px] font-medium",
            statusTone(post.status)
          )}
        >
          {(post.status.toLowerCase().includes("approv") ||
            post.status.toLowerCase().includes("publish")) && (
            <Check className="h-2.5 w-2.5 shrink-0" />
          )}
          {post.status}
        </span>
      </div>
    </div>
  );
}

export function SocialClient({
  hideHeader = false,
  memberView = false,
  initialContent,
}: {
  hideHeader?: boolean;
  /** Members: scheduled/published only, read-only calendar. */
  memberView?: boolean;
  /** SSR content rows — skips duplicate /api/content fetch on first load. */
  initialContent?: ContentItem[];
}) {
  const skipContentFetchRef = useRef(Boolean(initialContent));
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [openUrl, setOpenUrl] = useState("https://app.planable.io");
  const [sourceLabel, setSourceLabel] = useState("Social Posts");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [dateWindow, setDateWindow] = useState<"upcoming" | "past" | "all">(
    "upcoming"
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [overflowDay, setOverflowDay] = useState<{
    dateLabel: string;
    posts: SocialPost[];
  } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [createForm, setCreateForm] = useState<{
    due_date: string;
    title: string;
    caption: string;
    status: ContentStatus;
  } | null>(null);
  const [creating, setCreating] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const createFormRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!overflowDay) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOverflowDay(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [overflowDay]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let contentItems: ContentItem[];
      // Member view always refetches — SSR/admin payload can be stale after Planable sync.
      if (
        !memberView &&
        skipContentFetchRef.current &&
        initialContent
      ) {
        contentItems = initialContent;
        skipContentFetchRef.current = false;
      } else {
        skipContentFetchRef.current = false;
        const contentRes = await fetch("/api/content");
        const contentData = await contentRes.json();
        contentItems = (contentData.content ?? []) as ContentItem[];
      }

      const planableRes = await fetch("/api/planable/posts");
      const planable = await planableRes.json();
      setOpenUrl(planable.openUrl ?? "https://app.planable.io");

      const fromHub: SocialPost[] = contentItems
        .filter((c) => isSocialContentItem(c) && !!c.due_date)
        .map((c) => {
          const unique = platformsFromChannel(
            c.channel,
            c.title,
            c.caption || c.notes
          );
          const platform = unique[0] ?? "Social";
          const rawCaption = c.caption || c.notes || "";
          const text = hubPostDisplayText(c);
          const preview = previewAssetUrls(c.asset_url);
          const canva = primaryCanvaUrl(c.asset_url);
          return {
            id: c.id,
            text,
            html: looksLikeHtml(rawCaption) ? rawCaption : null,
            status: normalizeStatus(c.status),
            statusValue: c.status === "approved" ? "review" : c.status,
            scheduledAt: c.due_date ? `${c.due_date}T09:00:00.000Z` : null,
            url: c.planable_url || null,
            platform,
            platforms: unique,
            mediaUrl: preview[0] || canva || null,
            mediaUrls: preview,
            source: "hub" as const,
          };
        })
        .sort((a, b) =>
          String(a.scheduledAt ?? "").localeCompare(String(b.scheduledAt ?? ""))
        );

      const syncedHub = fromHub.filter((p) => {
        const raw = contentItems.find((c) => c.id === p.id);
        return Boolean(raw?.planable_post_id);
      });

      const fromPlanableRaw = (
        (planable.posts ?? []) as PlanableApiPost[]
      );
      const fromPlanable: SocialPost[] = fromPlanableRaw.map((p) => {
        const platforms = (p.platforms?.length
          ? p.platforms
          : p.pageName
            ? [p.pageName]
            : ["Social"]
        ).map(normalizePlatform);
        const mediaUrls = (p.mediaUrls?.length
          ? p.mediaUrls
          : p.mediaUrl
            ? [p.mediaUrl]
            : []
        ).filter(Boolean);
        const preview = [
          ...mediaUrls.filter(isPreviewableImageUrl),
          ...mediaUrls.filter(isVideoUrl),
        ];
        return {
          id: `pl_${p.id}`,
          text: stripHtml(p.text),
          html: null,
          status: normalizeStatus(p.status),
          scheduledAt: p.scheduledAt,
          url: p.url,
          platform: platforms[0] ?? "Social",
          platforms,
          mediaUrl: preview[0] ?? mediaUrls[0] ?? null,
          mediaUrls: preview.length ? preview : mediaUrls,
          source: "planable" as const,
          planableGroupId: p.groupId ?? null,
          planableSiblingIds: [p.id],
        };
      });

      const isMemberVisible = (status: string) => {
        const s = status.toLowerCase();
        return s === "scheduled" || s === "published";
      };

      let nextPosts: SocialPost[];

      if (memberView) {
        // Hub already stores one row per Planable group — prefer that so
        // multi-network posts (attendance, etc.) show once like admin.
        // Add collapsed Planable only for scheduled/published gaps.
        const hubVisible = fromHub.filter((p) => isMemberVisible(p.status));
        const hubPostIds = new Set<string>();
        const hubGroupIds = new Set<string>();
        const hubTextDays = new Set<string>();
        for (const p of hubVisible) {
          const raw = contentItems.find((c) => c.id === p.id);
          if (raw?.planable_post_id) hubPostIds.add(raw.planable_post_id);
          if (raw?.planable_group_id) hubGroupIds.add(raw.planable_group_id);
          const textKey = planableTextDayKey(p.text, p.scheduledAt);
          if (textKey) hubTextDays.add(textKey);
        }

        const planableOnly = collapsePlanableForMemberView(
          fromPlanableRaw.filter((p) =>
            isMemberVisible(normalizeStatus(p.status))
          )
        ).filter((p) => {
          if (
            (p.planableSiblingIds ?? []).some((id) => hubPostIds.has(id))
          ) {
            return false;
          }
          if (p.planableGroupId && hubGroupIds.has(p.planableGroupId)) {
            return false;
          }
          const textKey = planableTextDayKey(p.text, p.scheduledAt);
          if (textKey && hubTextDays.has(textKey)) return false;
          return true;
        });

        nextPosts = [...hubVisible, ...planableOnly];
        setSourceLabel("Scheduled & published");
      } else if (fromHub.length > 0) {
        nextPosts = fromHub;
        setSourceLabel(
          syncedHub.length > 0
            ? "Hub (synced with Planable)"
            : "Hub Social Posts"
        );
      } else {
        nextPosts = fromPlanable;
        setSourceLabel(
          planable.configured ? "Planable (live)" : "Social Posts"
        );
      }

      setPosts(nextPosts);
      if (planable.error && !memberView) setError(planable.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load social posts");
      setPosts([]);
    }
    setLoading(false);
  }, [memberView, initialContent]);

  async function syncFromPlanable() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/planable/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "Planable sync failed");
      } else {
        setSourceLabel(
          `Synced · ${data.created ?? 0} new · ${data.updated ?? 0} updated · ${data.removed ?? 0} removed`
        );
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Planable sync failed");
    }
    setSyncing(false);
  }

  useEffect(() => {
    void load();
  }, [load]);

  useHubDataRefresh("content", () => {
    void load();
  });

  const statuses = useMemo(() => {
    const set = new Set(posts.map((p) => p.status).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [posts]);

  const platforms = useMemo(() => {
    const set = new Set(
      posts.flatMap((p) =>
        p.platforms.length ? p.platforms : [p.platform]
      ).filter(Boolean)
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [posts]);

  const filtered = useMemo(() => {
    return posts.filter((p) => {
      if (
        !matchesSearch(search, [p.text, p.status, p.platform, ...p.platforms])
      ) {
        return false;
      }
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (
        platformFilter !== "all" &&
        !(p.platforms.length ? p.platforms : [p.platform]).includes(
          platformFilter
        )
      ) {
        return false;
      }
      return true;
    });
  }, [posts, search, statusFilter, platformFilter]);

  const datedPosts = useMemo(
    () =>
      filtered
        .filter((p) => p.scheduledAt)
        .sort((a, b) =>
          String(a.scheduledAt).localeCompare(String(b.scheduledAt))
        ),
    [filtered]
  );

  /** Calendar always includes historic so past months stay populated. */
  const calendarPosts = datedPosts;

  /** List is future-focused unless When filter is changed. */
  const listPosts = useMemo(() => {
    const today = startOfDay(new Date()).getTime();
    return datedPosts.filter((p) => {
      if (!p.scheduledAt) return false;
      const t = startOfDay(parseISO(p.scheduledAt)).getTime();
      if (Number.isNaN(t)) return false;
      if (dateWindow === "all") return true;
      if (dateWindow === "past") return t < today;
      return t >= today;
    });
  }, [datedPosts, dateWindow]);

  const postById = useMemo(() => {
    const map = new Map<string, SocialPost>();
    for (const p of calendarPosts) map.set(p.id, p);
    return map;
  }, [calendarPosts]);

  const calendarEvents = useMemo(
    () =>
      calendarPosts.map((p) => {
        const iso = p.scheduledAt!;
        const utcHm = iso.includes("T")
          ? iso.slice(11, 16)
          : "00:00";
        const allDay = utcHm === "00:00" || utcHm === "09:00";
        return {
          id: p.id,
          title: p.text.slice(0, 40),
          start: allDay ? iso.slice(0, 10) : iso,
          allDay,
          editable:
            !memberView &&
            p.source === "hub" &&
            p.status.toLowerCase() !== "published",
          startEditable:
            !memberView &&
            p.source === "hub" &&
            p.status.toLowerCase() !== "published",
          durationEditable: false,
          extendedProps: { postId: p.id, source: p.source },
        };
      }),
    [calendarPosts, memberView]
  );

  async function rescheduleHubPost(id: string, dueDate: string) {
    if (memberView) return;
    const post = posts.find((p) => p.id === id);
    if (!post || post.source !== "hub") return;
    if (post.status.toLowerCase() === "published") return;
    const previousScheduledAt = post.scheduledAt;
    setError(null);
    setPosts((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, scheduledAt: `${dueDate}T09:00:00.000Z` }
          : p
      )
    );
    const res = await fetch("/api/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update",
        id,
        patch: { due_date: dueDate },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setPosts((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, scheduledAt: previousScheduledAt } : p
        )
      );
      setError(data.error || "Could not update date");
      return;
    }
    if (data.planableSyncError) {
      setError(data.planableSyncError);
    }
  }

  function openCreateOnDate(dateStr: string) {
    if (memberView) return;
    const day = dateStr.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
    setSelectedId(null);
    setOverflowDay(null);
    setCreateForm((prev) =>
      prev
        ? { ...prev, due_date: day }
        : { due_date: day, title: "", caption: "", status: "idea" }
    );
    requestAnimationFrame(() => {
      createFormRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  async function createPostFromDay() {
    if (memberView || !createForm) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: createForm.title.trim() || "Untitled post",
          caption: createForm.caption,
          due_date: createForm.due_date,
          content_type: "Social",
          channel: ["LinkedIn"],
          status: createForm.status,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not create post");
        return;
      }
      if (data.planableSyncError) {
        setError(data.planableSyncError);
      }
      setCreateForm(null);
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function updateHubStatus(id: string, status: ContentStatus) {
    if (memberView || status === "published") return;
    setSavingStatus(true);
    setError(null);
    try {
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id,
          patch: { status },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not update status");
        return;
      }
      setPosts((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                status: normalizeStatus(status),
                statusValue: status,
                url: (data.item?.planable_url as string | undefined) || p.url,
              }
            : p
        )
      );
      await load();
      if (data.planableSyncError) {
        setError(data.planableSyncError);
      }
    } finally {
      setSavingStatus(false);
    }
  }

  const selected = selectedId
    ? posts.find((p) => p.id === selectedId) ?? null
    : null;

  return (
    <div>
      <FullCalendarStyles />
      <style>{HUB_CALENDAR_CSS}</style>

      {hideHeader ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl text-brand">
            Social Media Calendar
          </h2>
          {!memberView ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn-secondary"
                disabled={syncing || loading}
                onClick={() => void syncFromPlanable()}
              >
                {syncing ? "Syncing…" : "Sync from Planable"}
              </button>
              <a
                href={openUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-primary"
              >
                Open Planable
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          ) : null}
        </div>
      ) : (
        <PageHeader
          title="Social Media Calendar"
          description={
            memberView
              ? "Scheduled and published posts across channels."
              : "Approved Hub posts send one Facebook draft to Planable with the due date — add other platforms there, then schedule and publish."
          }
          actions={
            !memberView ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={syncing || loading}
                  onClick={() => void syncFromPlanable()}
                >
                  {syncing ? "Syncing…" : "Sync from Planable"}
                </button>
                <a
                  href={openUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-primary"
                >
                  Open Planable
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            ) : undefined
          }
        />
      )}

      {!memberView ? (
        <>
          <SocialMonthlyPlan />
          <SocialMonthlyTasks />
        </>
      ) : null}

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search posts, platform, status…"
        resultCount={listPosts.length}
        totalCount={posts.length}
        selects={[
          {
            id: "status",
            label: "Status",
            value: statusFilter,
            onChange: setStatusFilter,
            options: [
              { value: "all", label: "All statuses" },
              ...statuses.map((s) => ({ value: s, label: s })),
            ],
          },
          {
            id: "platform",
            label: "Platform",
            value: platformFilter,
            onChange: setPlatformFilter,
            options: [
              { value: "all", label: "All platforms" },
              ...platforms.map((p) => ({ value: p, label: p })),
            ],
          },
          {
            id: "when",
            label: "When",
            value: dateWindow,
            onChange: (v) =>
              setDateWindow(v as "upcoming" | "past" | "all"),
            options: [
              { value: "upcoming", label: "Upcoming (default)" },
              { value: "past", label: "Past only" },
              { value: "all", label: "All dates" },
            ],
          },
        ]}
      />

      {createForm && !memberView ? (
        <div
          ref={createFormRef}
          className="surface-card mb-6 grid gap-3 p-5 md:grid-cols-2"
        >
          <div className="md:col-span-2">
            <p className="text-sm font-semibold text-brand">New post</p>
            <p className="mt-0.5 text-xs text-muted">
              Date is set from the calendar day you clicked.
            </p>
          </div>
          <div>
            <label className="label">Title</label>
            <input
              className="field"
              value={createForm.title}
              onChange={(e) =>
                setCreateForm({ ...createForm, title: e.target.value })
              }
            />
          </div>
          <div>
            <label className="label">Date</label>
            <input
              className="field"
              type="date"
              value={createForm.due_date}
              onChange={(e) =>
                setCreateForm({ ...createForm, due_date: e.target.value })
              }
            />
          </div>
          <div>
            <label className="label">Status</label>
            <SearchSelect
              className="field"
              value={createForm.status}
              onChange={(status) =>
                setCreateForm({
                  ...createForm,
                  status: status as ContentStatus,
                })
              }
              options={HUB_STATUS_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
            />
            <p className="mt-1 text-xs text-muted">
              Approved sends a Facebook draft to Planable with the due date.
            </p>
          </div>
          <div className="md:col-span-2">
            <label className="label">Caption / post text</label>
            <textarea
              className="field min-h-[88px]"
              value={createForm.caption}
              onChange={(e) =>
                setCreateForm({ ...createForm, caption: e.target.value })
              }
            />
          </div>
          <div className="md:col-span-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary"
              disabled={creating}
              onClick={() => void createPostFromDay()}
            >
              {creating ? "Saving…" : "Save post"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={creating}
              onClick={() => setCreateForm(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted">Loading social calendar…</p>
      ) : (
        <div className="space-y-6">
          <p className="text-xs text-muted">
            Showing data from {sourceLabel}
            {error ? ` · ${error}` : ""}
          </p>

          <div
            className={cn(
              "hub-fc surface-card overflow-hidden p-3 md:p-4",
              !memberView && "hub-fc--day-create"
            )}
          >
            {!memberView ? (
              <p className="mb-3 text-xs text-muted">
                Click an empty day to add a post. Drag Hub drafts to reschedule.
              </p>
            ) : null}
            <FullCalendar
              plugins={[dayGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              height="auto"
              firstDay={1}
              events={calendarEvents}
              dayMaxEvents={3}
              moreLinkClick={(arg) => {
                const key = format(arg.date, "yyyy-MM-dd");
                const dayPosts = calendarPosts.filter((p) => {
                  if (!p.scheduledAt) return false;
                  try {
                    return format(parseISO(p.scheduledAt), "yyyy-MM-dd") === key;
                  } catch {
                    return p.scheduledAt.slice(0, 10) === key;
                  }
                });
                setOverflowDay({
                  dateLabel: format(arg.date, "EEEE d MMMM yyyy"),
                  posts: dayPosts,
                });
              }}
              editable={!memberView}
              eventStartEditable={!memberView}
              eventDurationEditable={false}
              eventDragMinDistance={8}
              dateClick={
                memberView
                  ? undefined
                  : (info) => {
                      const target = info.jsEvent.target as HTMLElement | null;
                      if (
                        target?.closest(
                          ".fc-more-link, .fc-daygrid-more-link, .fc-event"
                        )
                      ) {
                        return;
                      }
                      openCreateOnDate(info.dateStr);
                    }
              }
              headerToolbar={{
                left: "prev,next today",
                center: "title",
                right: "",
              }}
              eventClick={(info) => {
                info.jsEvent.preventDefault();
                const id = String(
                  info.event.extendedProps.postId ?? info.event.id
                );
                setSelectedId(id);
              }}
              eventDrop={(info) => {
                const source = info.event.extendedProps.source;
                const id = String(
                  info.event.extendedProps.postId ?? info.event.id
                );
                const post = posts.find((p) => p.id === id);
                if (
                  source !== "hub" ||
                  post?.status.toLowerCase() === "published"
                ) {
                  info.revert();
                  return;
                }
                const next = info.event.startStr.slice(0, 10);
                if (!next) {
                  info.revert();
                  return;
                }
                void rescheduleHubPost(id, next).catch(() => info.revert());
              }}
              eventClassNames="!border-0 !bg-transparent cursor-grab active:cursor-grabbing"
              eventContent={(arg) => {
                const id = String(
                  arg.event.extendedProps.postId ?? arg.event.id
                );
                const post = postById.get(id);
                if (!post) {
                  return (
                    <span className="truncate text-[10px] text-slate-600">
                      {arg.event.title}
                    </span>
                  );
                }
                return <PostCard post={post} compact />;
              }}
            />
          </div>

          <div className="surface-card overflow-hidden">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-brand">
                {dateWindow === "upcoming"
                  ? "Upcoming posts"
                  : dateWindow === "past"
                    ? "Past posts"
                    : "All dated posts"}
              </h2>
            </div>
            <ul className="divide-y divide-border">
              {listPosts.slice(0, 40).map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={cn(
                      "grid w-full grid-cols-[4rem_1fr_auto] items-center gap-2 px-4 py-3 text-left transition hover:bg-sand/70 sm:grid-cols-[4.5rem_7rem_1fr_auto] sm:gap-3",
                      selectedId === p.id && "bg-accent-soft/60"
                    )}
                    onClick={() => setSelectedId(p.id)}
                  >
                    <span className="text-sm text-muted">
                      {p.scheduledAt
                        ? format(parseISO(p.scheduledAt), "MMM d")
                        : "—"}
                    </span>
                    <span className="hidden w-fit rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-800 sm:inline-flex">
                      {p.platform}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {p.text || "Untitled post"}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted sm:hidden">
                        {p.platform}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
                        statusTone(p.status)
                      )}
                    >
                      {p.status}
                    </span>
                  </button>
                </li>
              ))}
              {listPosts.length === 0 ? (
                <li className="px-4 py-8 text-sm text-muted">
                  No posts match this When filter.
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      )}

      {overflowDay ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/25 md:left-sidebar"
            onClick={() => setOverflowDay(null)}
            aria-hidden
          />
          <div
            className="fixed left-1/2 top-[12%] z-50 w-[min(100%-1.5rem,280px)] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-white shadow-soft md:left-[calc(50%+var(--shell-sidebar-width)/2)]"
            role="dialog"
            aria-modal="true"
            aria-label={`Posts on ${overflowDay.dateLabel}`}
          >
            <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
              <h2 className="text-sm font-semibold text-brand">
                {overflowDay.dateLabel}
              </h2>
              <button
                type="button"
                className="btn-ghost px-2 py-1 text-xs"
                onClick={() => setOverflowDay(null)}
              >
                Close
              </button>
            </div>
            <div className="max-h-[min(70vh,520px)] space-y-2 overflow-y-auto p-2.5">
              {overflowDay.posts.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-muted">
                  No posts on this day.
                </p>
              ) : (
                overflowDay.posts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="block w-full text-left transition hover:opacity-90"
                    onClick={() => {
                      setSelectedId(p.id);
                      setOverflowDay(null);
                    }}
                  >
                    <PostCard post={p} compact />
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      ) : null}

      {selected ? (
        <RecordDrawer
          open
          onClose={() => setSelectedId(null)}
          title="Post preview"
          ariaLabel="Social post detail"
          footer={
            <div className="flex flex-wrap gap-2">
              {!memberView && selected.url ? (
                <a
                  href={selected.url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-primary"
                >
                  Open in Planable
                  <ExternalLink className="h-4 w-4" />
                </a>
              ) : null}
              {!memberView && !selected.url ? (
                <a href="/app/content" className="btn-secondary">
                  Edit in Content planner
                </a>
              ) : null}
              {isCanvaUrl(selected.mediaUrl) ? (
                <a
                  href={selected.mediaUrl!}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary"
                >
                  Open in Canva
                  <ExternalLink className="h-4 w-4" />
                </a>
              ) : null}
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setSelectedId(null)}
              >
                Close
              </button>
            </div>
          }
        >
              <div className="space-y-3">
              <PlatformPostPreview
                platforms={
                  selected.platforms.length
                    ? selected.platforms
                    : [selected.platform]
                }
                caption={selected.text}
                captionHtml={selected.html}
                images={selected.mediaUrls.filter(
                  (u) => isPreviewableImageUrl(u) || isVideoUrl(u)
                )}
                canvaUrl={
                  isCanvaUrl(selected.mediaUrl) ? selected.mediaUrl : null
                }
              />
              <div className="flex flex-wrap gap-2">
                {selected.platforms.map((p) => (
                  <span
                    key={p}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-700"
                  >
                    <PlatformBadge name={p} />
                    {p}
                  </span>
                ))}
                <StatusPill status={selected.status} />
              </div>
              {!memberView &&
              selected.source === "hub" &&
              selected.statusValue &&
              selected.statusValue !== "published" ? (
                <div>
                  <label className="label">Status</label>
                  <SearchSelect
                    className="field"
                    value={selected.statusValue}
                    disabled={savingStatus}
                    onChange={(status) =>
                      void updateHubStatus(
                        selected.id,
                        status as ContentStatus
                      )
                    }
                    options={HUB_STATUS_OPTIONS.map((o) => ({
                      value: o.value,
                      label: o.label,
                    }))}
                  />
                  <p className="mt-1 text-xs text-muted">
                    Approved sends a Facebook draft to Planable with the due date.
                    Add LinkedIn and Instagram there, then schedule, approve and publish.
                  </p>
                </div>
              ) : null}
              <p className="text-sm text-muted">
                {selected.scheduledAt
                  ? format(
                      parseISO(selected.scheduledAt),
                      "EEEE d MMMM yyyy · HH:mm"
                    )
                  : "No schedule date"}
              </p>
              {!memberView ? (
                <p className="text-xs text-muted">
                  Source:{" "}
                  {selected.source === "planable" ? "Planable" : "Hub Content"}
                </p>
              ) : null}
              </div>
        </RecordDrawer>
      ) : null}
    </div>
  );
}
