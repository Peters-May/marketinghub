"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  addDays,
  parseISO,
  startOfDay,
} from "date-fns";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import type { ContentItem, ContentStatus } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { FullCalendarStyles } from "@/components/ui/FullCalendarStyles";
import { FilterBar, matchesSearch } from "@/components/ui/FilterBar";
import { TimelineChart } from "@/components/ui/TimelineChart";
import { cn } from "@/lib/utils";
import {
  formatChannels,
  imageAssetUrls,
  isSocialContentItem,
  parseChannels,
  primaryCanvaUrl,
  stripHtml,
} from "@/lib/data/normalize";
import {
  ContentCalendarCard,
  HUB_CALENDAR_CSS,
} from "@/components/content/ContentCalendarCard";
import { AssetUploadField } from "@/components/content/AssetUploadField";
import { FileText, ImageIcon } from "lucide-react";
import {
  CompactMultiImageThumb,
  PlatformPostPreview,
} from "@/components/social/PlatformPostPreview";
import { ChannelMultiSelect } from "@/components/ui/ChannelMultiSelect";
import {
  CHANNELS,
  CONTENT_CATEGORIES,
  CONTENT_OUTLETS,
  CONTENT_PRIORITIES,
  CONTENT_TYPES,
  SOCIAL_CHANNELS,
  optionsForField,
  orderedFilterValues,
  selectOptionsWithCurrent,
  type FieldOption,
} from "@/lib/data/collections";
import {
  useCreatableSelectOptions,
  useManagedFieldOptions,
} from "@/lib/data/useManagedFieldOptions";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { RichTextView } from "@/components/ui/RichTextView";
import { plainTextFromHtml } from "@/lib/plain-text";
import { statusEventColor } from "@/lib/ui/statusTokens";
import { RecordDrawer } from "@/components/ui/RecordDrawer";
import { RelatedTasksPanel } from "@/components/tasks/RelatedTasksPanel";
import { SearchSelect } from "@/components/ui/SearchSelect";

const COLUMNS: { id: ContentStatus; label: string }[] = [
  { id: "idea", label: "Idea" },
  { id: "draft", label: "Draft" },
  { id: "review", label: "Approved" },
  { id: "scheduled", label: "Scheduled" },
  { id: "published", label: "Published" },
  { id: "cancelled", label: "Cancelled" },
];

/** Hub can move pieces through these; Published only arrives from Planable sync. */
const HUB_EDITABLE_STATUSES = COLUMNS.filter((c) => c.id !== "published");

const VIEWS = [
  { id: "calendar", label: "Calendar" },
  { id: "kanban", label: "Kanban" },
  { id: "timeline", label: "Timeline" },
] as const;

type ContentView = (typeof VIEWS)[number]["id"];

const STATUS_COLOR: Record<ContentStatus, string> = {
  idea: statusEventColor("idea"),
  draft: statusEventColor("draft"),
  review: statusEventColor("review"),
  approved: statusEventColor("review"),
  scheduled: statusEventColor("scheduled"),
  published: statusEventColor("published"),
  cancelled: statusEventColor("cancelled"),
};

function emptyFormForScope(scope: "all" | "content" | "social") {
  const social = scope !== "content";
  return {
    title: "",
    channel: social ? (["LinkedIn"] as string[]) : (["Editorial"] as string[]),
    content_type: social ? "Social" : "Editorial",
    due_date: "",
    deadline_date: "",
    category: "",
    priority: "",
    website: "",
    caption: "",
    notes: "",
    planable_url: "",
    asset_url: "",
    status: "idea" as ContentStatus,
  };
}

type EditForm = {
  title: string;
  channel: string[];
  content_type: string;
  due_date: string;
  deadline_date: string;
  category: string;
  priority: string;
  website: string;
  caption: string;
  notes: string;
  planable_url: string;
  asset_url: string;
  status: ContentStatus;
};

function toEditForm(item: ContentItem): EditForm {
  return {
    title: item.title,
    channel: parseChannels(item.channel),
    content_type: item.content_type || "Social",
    due_date: item.due_date ?? "",
    deadline_date: item.deadline_date ?? "",
    category: item.category ?? "",
    priority: item.priority ?? "",
    website: item.website ?? "",
    caption: item.caption ?? "",
    notes: item.notes,
    planable_url: item.planable_url,
    asset_url: item.asset_url,
    status: item.status === "approved" ? "review" : item.status,
  };
}

function channelOptionsForType(
  contentType: string,
  current: string[] = [],
  allChannels: FieldOption[] = CHANNELS
) {
  const socialValues = new Set(SOCIAL_CHANNELS.map((o) => o.value));
  const isSocial = isSocialContentItem({ content_type: contentType, channel: [] });
  const filtered = allChannels.filter((o) =>
    isSocial ? socialValues.has(o.value) : !socialValues.has(o.value)
  );
  const base =
    filtered.length > 0
      ? filtered
      : isSocial
        ? SOCIAL_CHANNELS
        : CONTENT_OUTLETS;
  const extras = current.filter(
    (c) => c && !base.some((o) => o.value === c)
  );
  return [
    ...extras.map((c) => ({ value: c, label: `${c} (custom)` })),
    ...base,
  ];
}

function statusLabel(status: ContentStatus) {
  return COLUMNS.find((c) => c.id === status)?.label ?? status;
}

function parseDue(item: ContentItem): Date | null {
  if (!item.due_date) return null;
  try {
    return parseISO(item.due_date.slice(0, 10));
  } catch {
    return null;
  }
}

/** Upcoming = today or later, or no date (still in the pipeline). */
function matchesDateWindow(
  item: ContentItem,
  window: "upcoming" | "past" | "all" | "undated"
): boolean {
  if (window === "all") return true;
  const due = parseDue(item);
  if (window === "undated") return !due;
  if (!due) return window === "upcoming";
  const today = startOfDay(new Date()).getTime();
  const t = startOfDay(due).getTime();
  if (window === "upcoming") return t >= today;
  if (window === "past") return t < today;
  return true;
}

export function ContentClient({
  initial,
  hideHeader = false,
  scope = "all",
  fieldOptions: fieldOptionsProp,
}: {
  initial: ContentItem[];
  hideHeader?: boolean;
  /** When "content", hide social posts; when "social", only social. */
  scope?: "all" | "content" | "social";
  /** From Field Manager — drives select option order on this page. */
  fieldOptions?: Record<string, FieldOption[]>;
}) {
  const fieldOptions = useManagedFieldOptions("content", fieldOptionsProp);
  const contentTypeOptions = optionsForField(
    fieldOptions,
    "content_type",
    CONTENT_TYPES
  );
  const { options: categoryOptions, addOption: addCategoryOption } =
    useCreatableSelectOptions(
      "content",
      "category",
      fieldOptions,
      CONTENT_CATEGORIES
    );
  const priorityOptions = optionsForField(
    fieldOptions,
    "priority",
    CONTENT_PRIORITIES
  );
  const channelOptions = optionsForField(fieldOptions, "channel", CHANNELS);

  const [items, setItems] = useState(initial);
  const [view, setView] = useState<ContentView>("calendar");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(() => emptyFormForScope(scope));
  const formRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [channelFilter, setChannelFilter] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [datedOnly, setDatedOnly] = useState<"upcoming" | "past" | "all" | "undated">(
    "upcoming"
  );

  const formIsSocial = isSocialContentItem({
    content_type: form.content_type,
    channel: form.channel,
  });
  const editIsSocial = edit
    ? isSocialContentItem({
        content_type: edit.content_type,
        channel: edit.channel,
      })
    : false;

  const refresh = useCallback(async () => {
    const res = await fetch("/api/content");
    const data = await res.json();
    setItems(data.content ?? []);
  }, []);

  const scopedItems = useMemo(() => {
    if (scope === "social") return items.filter(isSocialContentItem);
    if (scope === "content") return items.filter((i) => !isSocialContentItem(i));
    return items;
  }, [items, scope]);

  const channels = useMemo(() => {
    const present = scopedItems
      .flatMap((i) => parseChannels(i.channel))
      .filter(Boolean);
    return orderedFilterValues(channelOptions, present);
  }, [scopedItems, channelOptions]);

  const contentTypes = useMemo(() => {
    const present = scopedItems
      .map((i) => (i.content_type || "").trim())
      .filter(Boolean);
    return orderedFilterValues(contentTypeOptions, present);
  }, [scopedItems, contentTypeOptions]);

  const filtered = useMemo(() => {
    return scopedItems.filter((item) => {
      if (
        !matchesSearch(search, [
          item.title,
          formatChannels(item.channel),
          item.content_type,
          plainTextFromHtml(item.notes),
          item.status,
        ])
      ) {
        return false;
      }
      if (
        statusFilter.length > 0 &&
        !statusFilter.includes(item.status) &&
        !(item.status === "approved" && statusFilter.includes("review"))
      ) {
        return false;
      }
      if (
        channelFilter.length > 0 &&
        !parseChannels(item.channel).some((c) => channelFilter.includes(c))
      ) {
        return false;
      }
      if (
        typeFilter.length > 0 &&
        !typeFilter.includes(item.content_type)
      ) {
        return false;
      }
      return true;
    });
  }, [
    scopedItems,
    search,
    statusFilter,
    channelFilter,
    typeFilter,
  ]);

  /** Lists / Kanban / Timeline — future-focused unless date filter opened up. */
  const listItems = useMemo(
    () => filtered.filter((item) => matchesDateWindow(item, datedOnly)),
    [filtered, datedOnly]
  );

  /** Calendar keeps historic posts so past months still populate. */
  const calendarItems = useMemo(
    () =>
      filtered.filter((item) => {
        if (!item.due_date) return false;
        if (datedOnly === "all" || datedOnly === "upcoming") return true;
        return matchesDateWindow(item, datedOnly);
      }),
    [filtered, datedOnly]
  );

  const editingItem = editingId
    ? items.find((i) => i.id === editingId) ?? null
    : null;
  const editLocked = editingItem?.status === "published";

  async function syncFromPlanable() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/planable/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.error) {
        setSyncMessage(data.error || "Planable sync failed");
      } else {
        setSyncMessage(
          `Planable sync: ${data.created ?? 0} new, ${data.updated ?? 0} updated, ${data.removed ?? 0} removed`
        );
      }
      await refresh();
    } catch (e) {
      setSyncMessage(
        e instanceof Error ? e.message : "Planable sync failed"
      );
    }
    setSyncing(false);
  }

  const calendarEvents = useMemo(
    () =>
      calendarItems.map((i) => {
        // Date-only start avoids UTC midnight showing as "1a" (1am) in BST.
        const start = i.due_date!.slice(0, 10);
        return {
          id: i.id,
          title: i.title,
          start,
          allDay: true,
          extendedProps: { itemId: i.id },
        };
      }),
    [calendarItems]
  );

  const calendarItemById = useMemo(() => {
    const map = new Map<string, ContentItem>();
    for (const i of calendarItems) map.set(i.id, i);
    return map;
  }, [calendarItems]);

  const timelineItems = useMemo(() => {
    return listItems
      .map((item) => {
        const due = parseDue(item);
        if (!due) return null;
        const created = item.created_at
          ? parseISO(item.created_at.slice(0, 10))
          : addDays(due, -7);
        const start =
          created.getTime() <= due.getTime() ? created : addDays(due, -7);
        return {
          id: item.id,
          label: item.title,
          subtitle: [
            statusLabel(item.status),
            formatChannels(item.channel),
            item.content_type,
          ]
            .filter(Boolean)
            .join(" · "),
          start,
          end: due,
          color: STATUS_COLOR[item.status],
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [listItems]);

  const undatedCount = useMemo(
    () => listItems.filter((i) => !i.due_date).length,
    [listItems]
  );

  async function create() {
    setSyncMessage(null);
    const res = await fetch("/api/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        due_date: form.due_date || null,
        deadline_date: form.deadline_date || null,
        status: form.status,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.planableSyncError) {
      setSyncMessage(data.planableSyncError);
    }
    setShowForm(false);
    setForm(emptyFormForScope(scope));
    await refresh();
  }

  function openEdit(item: ContentItem) {
    setEditingId(item.id);
    setEdit(toEditForm(item));
  }

  function openCreateOnDate(dateStr: string) {
    const day = dateStr.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
    closeEdit();
    setForm((prev) => ({
      ...(showForm ? prev : emptyFormForScope(scope)),
      due_date: day,
    }));
    setShowForm(true);
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function closeEdit() {
    setEditingId(null);
    setEdit(null);
  }

  async function saveEdit() {
    if (!editingId || !edit) return;
    if (edit.status === "published" || editLocked) {
      closeEdit();
      return;
    }
    setSaving(true);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: editingId,
          patch: {
            title: edit.title.trim() || "Untitled post",
            channel: edit.channel.length ? edit.channel : ["Social"],
            content_type: edit.content_type.trim() || "Social",
            due_date: edit.due_date || null,
            deadline_date: edit.deadline_date || null,
            category: edit.category,
            priority: edit.priority,
            website: edit.website,
            caption: edit.caption,
            notes: edit.notes,
            planable_url: edit.planable_url,
            asset_url: edit.asset_url,
            status: edit.status,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSyncMessage(data.error || "Save failed");
        return;
      }
      if (data.planableSyncError) {
        setSyncMessage(data.planableSyncError);
      }
      closeEdit();
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function move(id: string, status: ContentStatus) {
    const item = items.find((i) => i.id === id);
    if (item?.status === "published") return;
    if (status === "published") return;
    setSyncMessage(null);
    const res = await fetch("/api/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", id, patch: { status } }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSyncMessage(data.error || "Could not update status");
      return;
    }
    if (data.planableSyncError) {
      setSyncMessage(data.planableSyncError);
    }
    if (editingId === id && edit) {
      setEdit({ ...edit, status });
    }
    await refresh();
  }

  async function reschedule(id: string, dueDate: string) {
    const item = items.find((i) => i.id === id);
    if (item?.status === "published") return;
    const previousDueDate = item?.due_date ?? null;
    setSyncMessage(null);
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, due_date: dueDate } : i))
    );
    if (editingId === id && edit) {
      setEdit({ ...edit, due_date: dueDate });
    }
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
      setItems((prev) =>
        prev.map((i) =>
          i.id === id ? { ...i, due_date: previousDueDate } : i
        )
      );
      if (editingId === id && edit) {
        setEdit({ ...edit, due_date: previousDueDate ?? "" });
      }
      setSyncMessage(data.error || "Could not update date");
      return;
    }
    if (data.planableSyncError) {
      setSyncMessage(data.planableSyncError);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this content piece?")) return;
    await fetch("/api/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    if (editingId === id) closeEdit();
    await refresh();
  }

  function CardSummary({ item }: { item: ContentItem }) {
    const social = isSocialContentItem(item);
    const images = imageAssetUrls(item.asset_url);
    const canva = images.length === 0 ? primaryCanvaUrl(item.asset_url) : "";

    return (
      <>
        {images.length > 0 || canva ? (
          <div className="mb-2">
            <CompactMultiImageThumb images={images} canvaUrl={canva || null} />
          </div>
        ) : social ? (
          <div className="mb-2 flex aspect-[16/10] w-full items-center justify-center rounded-lg bg-gradient-to-br from-sky-50 to-slate-100 text-sky-200">
            <ImageIcon className="h-7 w-7" />
          </div>
        ) : (
          <div className="mb-2 flex aspect-[16/10] w-full items-center justify-center rounded-lg bg-gradient-to-br from-slate-100 to-sand text-slate-300">
            <FileText className="h-7 w-7" />
          </div>
        )}
        <p className="text-sm font-medium">{item.title}</p>
        <p className="mt-1 text-xs text-muted">
          {item.content_type ? `${item.content_type} · ` : ""}
          {formatChannels(item.channel)}
          {item.due_date ? ` · due ${item.due_date}` : ""}
          {item.status === "published" ? " · Locked" : ""}
        </p>
        {plainTextFromHtml(item.caption || item.notes) ? (
          <RichTextView
            html={item.caption || item.notes}
            plain
            clampLines={2}
            className="mt-2 text-xs text-foreground/70"
          />
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-secondary px-2.5 py-1.5 text-xs"
            onClick={() => openEdit(item)}
          >
            {item.status === "published" ? "View" : "Edit"}
          </button>
          <SearchSelect
            className="field !w-auto py-1.5 text-xs"
            value={item.status === "approved" ? "review" : item.status}
            disabled={item.status === "published"}
            onChange={(value) =>
              void move(item.id, value as ContentStatus)
            }
            aria-label="Move to status"
            options={[
              ...(item.status === "published"
                ? [{ value: "published", label: "Published (Planable)" }]
                : []),
              ...HUB_EDITABLE_STATUSES.map((c) => ({
                value: c.id,
                label: c.label,
              })),
            ]}
          />
        </div>
      </>
    );
  }

  return (
    <div>
      <FullCalendarStyles />
      <style>{HUB_CALENDAR_CSS}</style>
      {hideHeader ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl text-brand">
            {scope === "all"
              ? "Content & Social"
              : scope === "content"
                ? "Content planner"
                : "Content"}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {scope !== "content" ? (
              <button
                type="button"
                className="btn-secondary"
                disabled={syncing}
                onClick={() => void syncFromPlanable()}
              >
                {syncing ? "Syncing…" : "Sync from Planable"}
              </button>
            ) : null}
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setForm(emptyFormForScope(scope));
                setShowForm(true);
              }}
            >
              Add piece
            </button>
          </div>
        </div>
      ) : (
        <PageHeader
          title="Content planner"
          description="Draft social in the Hub; Approved sends one Facebook draft to Planable with the due date. Add LinkedIn and Instagram there, then schedule, approve and publish. Published posts are locked."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {scope !== "content" ? (
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={syncing}
                  onClick={() => void syncFromPlanable()}
                >
                  {syncing ? "Syncing…" : "Sync from Planable"}
                </button>
              ) : null}
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setForm(emptyFormForScope(scope));
                  setShowForm(true);
                }}
              >
                Add piece
              </button>
            </div>
          }
        />
      )}

      {syncMessage ? (
        <p className="mb-4 text-xs text-muted">{syncMessage}</p>
      ) : null}

      <div
        className="mb-5 inline-flex flex-wrap gap-1 rounded-2xl border border-border bg-white p-1"
        role="tablist"
        aria-label="Content views"
      >
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={view === v.id}
            className={cn(
              "rounded-xl px-3.5 py-2 text-sm font-medium transition",
              view === v.id
                ? "bg-brand text-white shadow-sm"
                : "text-muted hover:bg-sand hover:text-foreground"
            )}
            onClick={() => setView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search title, channel, notes…"
        resultCount={view === "calendar" ? calendarItems.length : listItems.length}
        totalCount={scopedItems.length}
        selects={[
          {
            id: "status",
            label: "Status",
            multiple: true,
            value: statusFilter,
            onChange: setStatusFilter,
            allLabel: "All statuses",
            options: COLUMNS.map((c) => ({ value: c.id, label: c.label })),
          },
          {
            id: "type",
            label: "Type",
            multiple: true,
            value: typeFilter,
            onChange: setTypeFilter,
            allLabel: "All types",
            options: contentTypes.map((t) => ({ value: t, label: t })),
          },
          {
            id: "channel",
            label: "Channel",
            multiple: true,
            value: channelFilter,
            onChange: setChannelFilter,
            allLabel: "All channels",
            options: channels.map((c) => ({ value: c, label: c })),
          },
          {
            id: "dated",
            label: "When",
            value: datedOnly,
            onChange: (v) =>
              setDatedOnly(v as "upcoming" | "past" | "all" | "undated"),
            clearValue: "upcoming",
            options: [
              { value: "upcoming", label: "Upcoming (default)" },
              { value: "past", label: "Past only" },
              { value: "all", label: "All dates" },
              { value: "undated", label: "No due date" },
            ],
          },
        ]}
      />

      {showForm ? (
        <div
          ref={formRef}
          className="surface-card mb-6 grid gap-3 p-5 md:grid-cols-2"
        >
          <div className="md:col-span-2">
            <label className="label">Title</label>
            <input
              className="field"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Content type</label>
            <SearchSelect
              className="field"
              value={form.content_type}
              onChange={(content_type) => {
                const social = isSocialContentItem({
                  content_type,
                  channel: [],
                });
                setForm({
                  ...form,
                  content_type,
                  channel: social ? ["LinkedIn"] : ["Editorial"],
                });
              }}
              options={contentTypeOptions}
            />
          </div>
          <div>
            <label className="label">Date</label>
            <input
              className="field"
              type="date"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
            />
            <p className="mt-1 text-xs text-muted">
              Publish or go-live date — used on calendar and timeline.
            </p>
          </div>
          <div>
            <label className="label">Status</label>
            <SearchSelect
              className="field"
              value={form.status}
              onChange={(status) =>
                setForm({ ...form, status: status as ContentStatus })
              }
              options={HUB_EDITABLE_STATUSES.map((c) => ({
                value: c.id,
                label: c.label,
              }))}
            />
            {formIsSocial ? (
              <p className="mt-1 text-xs text-muted">
                Approved sends a Facebook draft to Planable with the due date.
              </p>
            ) : null}
          </div>
          <div>
            <label className="label">Category</label>
            <SearchSelect
              className="field"
              value={form.category}
              allowEmpty
              emptyLabel="Select…"
              placeholder="Select…"
              searchPlaceholder="Search or add a category…"
              noResultsLabel="No matches — add it as a new category"
              allowCreate
              createLabel={(query) => `Add “${query}”`}
              onCreate={(name) => {
                const category = addCategoryOption(name);
                if (category) setForm({ ...form, category });
              }}
              onChange={(category) => setForm({ ...form, category })}
              options={categoryOptions}
            />
          </div>
          <div>
            <label className="label">Priority</label>
            <SearchSelect
              className="field"
              value={form.priority}
              allowEmpty
              emptyLabel="None"
              placeholder="None"
              onChange={(priority) => setForm({ ...form, priority })}
              options={priorityOptions}
            />
          </div>
          <div className="md:col-span-2">
            <label className="label">
              {formIsSocial ? "Platforms" : "Channels / outlets"}
            </label>
            <ChannelMultiSelect
              value={form.channel}
              options={channelOptionsForType(
                form.content_type,
                form.channel,
                channelOptions
              )}
              onChange={(channel) => setForm({ ...form, channel })}
            />
          </div>
          {formIsSocial ? (
            <div className="md:col-span-2">
              <label className="label">Caption / post text</label>
              <RichTextEditor
                value={form.caption}
                onChange={(caption) => setForm({ ...form, caption })}
                placeholder="Caption / post text…"
                minHeight="70px"
              />
            </div>
          ) : (
            <>
              <div>
                <label className="label">Deadline</label>
                <input
                  className="field"
                  type="date"
                  value={form.deadline_date}
                  onChange={(e) =>
                    setForm({ ...form, deadline_date: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="label">Website / publication URL</label>
                <input
                  className="field"
                  type="url"
                  placeholder="https://"
                  value={form.website}
                  onChange={(e) =>
                    setForm({ ...form, website: e.target.value })
                  }
                />
              </div>
            </>
          )}
          <div className="md:col-span-2">
            <label className="label">Notes</label>
            <RichTextEditor
              value={form.notes}
              onChange={(notes) => setForm({ ...form, notes })}
              placeholder="Notes…"
              minHeight="70px"
            />
          </div>
          <div className="md:col-span-2">
            <AssetUploadField
              multiple
              value={form.asset_url}
              onChange={(asset_url) => setForm({ ...form, asset_url })}
            />
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-primary" onClick={() => void create()}>
              Save
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setShowForm(false);
                setForm(emptyFormForScope(scope));
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div>
          {view === "kanban" ? (
            <div className="flex gap-4 overflow-x-auto pb-2">
              {COLUMNS.map((col) => {
                const colItems = listItems.filter((i) =>
                  col.id === "review"
                    ? i.status === "review" || i.status === "approved"
                    : i.status === col.id
                );
                return (
                  <div
                    key={col.id}
                    className="surface-card flex w-80 shrink-0 flex-col p-3"
                  >
                    <div className="mb-3 flex items-center justify-between px-1">
                      <h2 className="text-sm font-semibold text-brand">{col.label}</h2>
                      <span className="text-xs text-muted">{colItems.length}</span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {colItems.map((item) => (
                        <article
                          key={item.id}
                          className="rounded-xl border border-border bg-sand/60 p-3"
                        >
                          <CardSummary item={item} />
                        </article>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {view === "calendar" ? (
            <div className="hub-fc hub-fc--day-create surface-card overflow-hidden p-3 md:p-4">
              <p className="mb-3 text-xs text-muted">
                {scope === "all"
                  ? "Content and Social on one calendar. Click an empty day to add a piece, drag cards to reschedule, or click a card to edit."
                  : "Click an empty day to add a piece, drag cards to reschedule, or click a card to edit."}
              </p>
              <FullCalendar
                plugins={[dayGridPlugin, interactionPlugin, listPlugin]}
                initialView="dayGridMonth"
                headerToolbar={{
                  left: "prev,next today",
                  center: "title",
                  right: "dayGridMonth,listWeek",
                }}
                height="auto"
                firstDay={1}
                dayMaxEvents={3}
                moreLinkClick="popover"
                editable
                eventStartEditable
                eventDurationEditable={false}
                eventDragMinDistance={8}
                events={calendarEvents}
                eventClassNames="!border-0 !bg-transparent cursor-grab active:cursor-grabbing"
                dateClick={(info) => {
                  const target = info.jsEvent.target as HTMLElement | null;
                  if (
                    target?.closest(
                      ".fc-more-link, .fc-daygrid-more-link, .fc-event"
                    )
                  ) {
                    return;
                  }
                  openCreateOnDate(info.dateStr);
                }}
                eventClick={(info) => {
                  info.jsEvent.preventDefault();
                  const item = items.find((i) => i.id === info.event.id);
                  if (item) openEdit(item);
                }}
                eventDrop={(info) => {
                  const id = String(
                    info.event.extendedProps.itemId ?? info.event.id
                  );
                  const item = items.find((i) => i.id === id);
                  if (item?.status === "published") {
                    info.revert();
                    return;
                  }
                  const next = info.event.startStr.slice(0, 10);
                  if (!next) {
                    info.revert();
                    return;
                  }
                  void reschedule(id, next).catch(() => info.revert());
                }}
                eventContent={(arg) => {
                  const id = String(
                    arg.event.extendedProps.itemId ?? arg.event.id
                  );
                  const item = calendarItemById.get(id);
                  if (!item) {
                    return (
                      <span className="truncate text-[10px] text-slate-600">
                        {arg.event.title}
                      </span>
                    );
                  }
                  return <ContentCalendarCard item={item} compact />;
                }}
              />
              {calendarEvents.length === 0 ? (
                <p className="mt-4 text-sm text-muted">
                  No dated pieces yet — add a due date when editing.
                </p>
              ) : null}
            </div>
          ) : null}

          {view === "timeline" ? (
            <TimelineChart
              items={timelineItems}
              onSelect={(id) => {
                const item = listItems.find((i) => i.id === id);
                if (item) openEdit(item);
              }}
              emptyMessage="No dated pieces in this filter. Add due dates, or set When to All dates / Past."
              footer={
                undatedCount > 0 ? (
                  <p className="mt-4 text-xs text-muted">
                    {undatedCount} piece(s) have no due date and are hidden here
                    — switch to Kanban to edit them.
                  </p>
                ) : null
              }
            />
          ) : null}
      </div>

      {edit && editingItem ? (
        <RecordDrawer
          open
          onClose={closeEdit}
          title={editLocked ? "Published piece (locked)" : "Edit piece"}
          ariaLabel="Edit content piece"
          banner={
            editLocked ? (
              <p className="border-b border-border bg-emerald-50 px-4 py-2 text-xs text-emerald-900">
                Published — editing is locked. You can only delete this piece
                from the Hub. Approve and publish stay in Planable.
              </p>
            ) : undefined
          }
          footer={
            <div className="flex flex-wrap gap-2">
              {!editLocked ? (
                <button
                  type="button"
                  className="btn-primary"
                  disabled={saving}
                  onClick={() => void saveEdit()}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              ) : null}
              <button
                type="button"
                className="btn-secondary"
                disabled={saving}
                onClick={closeEdit}
              >
                {editLocked ? "Close" : "Cancel"}
              </button>
              <button
                type="button"
                className="btn-ghost text-[var(--danger)]"
                disabled={saving}
                onClick={() => void remove(editingItem.id)}
              >
                Delete
              </button>
            </div>
          }
        >
              {editIsSocial ? (
                <div className="mb-4">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted">
                    Platform preview
                  </p>
                  <PlatformPostPreview
                    platforms={edit.channel}
                    caption={stripHtml(edit.caption || edit.title)}
                    captionHtml={edit.caption}
                    images={imageAssetUrls(edit.asset_url)}
                    canvaUrl={primaryCanvaUrl(edit.asset_url) || null}
                  />
                </div>
              ) : null}
              <fieldset disabled={editLocked} className="grid min-w-0 max-w-full gap-2 disabled:opacity-80 [&>*]:min-w-0">
                <div>
                  <label className="label">Title</label>
                  <input
                    className="field"
                    value={edit.title}
                    onChange={(e) => setEdit({ ...edit, title: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Content type</label>
                  <SearchSelect
                    className="field"
                    value={edit.content_type}
                    onChange={(content_type) => {
                      const social = isSocialContentItem({
                        content_type,
                        channel: [],
                      });
                      setEdit({
                        ...edit,
                        content_type,
                        channel: social
                          ? edit.channel.filter((c) =>
                              SOCIAL_CHANNELS.some((o) => o.value === c)
                            ).length
                            ? edit.channel
                            : ["LinkedIn"]
                          : edit.channel.filter((c) =>
                              CONTENT_OUTLETS.some((o) => o.value === c)
                            ).length
                            ? edit.channel
                            : ["Editorial"],
                      });
                    }}
                    options={selectOptionsWithCurrent(
                      contentTypeOptions,
                      edit.content_type
                    )}
                  />
                </div>
                <div>
                  <label className="label">Date</label>
                  <input
                    className="field"
                    type="date"
                    value={edit.due_date}
                    onChange={(e) =>
                      setEdit({ ...edit, due_date: e.target.value })
                    }
                  />
                  <p className="mt-1 text-xs text-muted">
                    Publish or go-live date — used on calendar and timeline.
                  </p>
                </div>
                <div>
                  <label className="label">Category</label>
                  <SearchSelect
                    className="field"
                    value={edit.category}
                    allowEmpty
                    emptyLabel="Select…"
                    placeholder="Select…"
                    searchPlaceholder="Search or add a category…"
                    noResultsLabel="No matches — add it as a new category"
                    allowCreate
                    createLabel={(query) => `Add “${query}”`}
                    onCreate={(name) => {
                      const category = addCategoryOption(name);
                      if (category) setEdit({ ...edit, category });
                    }}
                    onChange={(category) =>
                      setEdit({ ...edit, category })
                    }
                    options={selectOptionsWithCurrent(
                      categoryOptions,
                      edit.category
                    )}
                  />
                </div>
                <div>
                  <label className="label">Priority</label>
                  <SearchSelect
                    className="field"
                    value={edit.priority}
                    allowEmpty
                    emptyLabel="None"
                    placeholder="None"
                    onChange={(priority) =>
                      setEdit({ ...edit, priority })
                    }
                    options={selectOptionsWithCurrent(
                      priorityOptions,
                      edit.priority
                    )}
                  />
                </div>
                <div>
                  <label className="label">
                    {editIsSocial ? "Platforms" : "Channels / outlets"}
                  </label>
                  <ChannelMultiSelect
                    value={edit.channel}
                    options={channelOptionsForType(
                      edit.content_type,
                      edit.channel,
                      channelOptions
                    )}
                    onChange={(channel) => setEdit({ ...edit, channel })}
                  />
                </div>
                <div>
                  <label className="label">Status</label>
                  <SearchSelect
                    className="field"
                    value={edit.status}
                    onChange={(status) =>
                      setEdit({
                        ...edit,
                        status: status as ContentStatus,
                      })
                    }
                    options={[
                      ...(edit.status === "published"
                        ? [
                            {
                              value: "published",
                              label: "Published (Planable)",
                            },
                          ]
                        : []),
                      ...HUB_EDITABLE_STATUSES.map((c) => ({
                        value: c.id,
                        label: c.label,
                      })),
                    ]}
                  />
                  {editIsSocial ? (
                    <p className="mt-1 text-xs text-muted">
                      Approved sends a Facebook draft to Planable with the due
                      date. Add platforms, schedule, approve, and publish there —
                      then Sync from Planable locks this piece.
                    </p>
                  ) : null}
                </div>
                {editIsSocial ? (
                  <>
                    <div>
                      <label className="label">Caption / post text</label>
                      <RichTextEditor
                        value={edit.caption}
                        onChange={(caption) => setEdit({ ...edit, caption })}
                        placeholder="Caption / post text…"
                        minHeight="70px"
                      />
                    </div>
                    <div>
                      <label className="label">Planable URL</label>
                      <input
                        className="field"
                        value={edit.planable_url}
                        onChange={(e) =>
                          setEdit({ ...edit, planable_url: e.target.value })
                        }
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="label">Deadline</label>
                      <input
                        className="field"
                        type="date"
                        value={edit.deadline_date}
                        onChange={(e) =>
                          setEdit({ ...edit, deadline_date: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="label">Website / publication URL</label>
                      <input
                        className="field"
                        type="url"
                        placeholder="https://"
                        value={edit.website}
                        onChange={(e) =>
                          setEdit({ ...edit, website: e.target.value })
                        }
                      />
                    </div>
                  </>
                )}
                <div>
                  <label className="label">Notes</label>
                  <RichTextEditor
                    value={edit.notes}
                    onChange={(notes) => setEdit({ ...edit, notes })}
                    placeholder="Notes…"
                    minHeight="70px"
                  />
                </div>
                <div>
                  <AssetUploadField
                    multiple
                    value={edit.asset_url}
                    onChange={(asset_url) => setEdit({ ...edit, asset_url })}
                  />
                </div>
                <RelatedTasksPanel
                  relatedType="content"
                  relatedId={editingId}
                />
              </fieldset>
        </RecordDrawer>
      ) : null}
    </div>
  );
}
