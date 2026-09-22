"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CornerDownRight, ExternalLink, Paperclip, Plus } from "lucide-react";
import type {
  ContentItem,
  ContentStatus,
  QuarterlyTheme,
  ThemeMainContent,
  ThemeOffshoot,
  ThemeStatus,
} from "@/lib/types";
import { PageHeader, EmptyState } from "@/components/ui/PageHeader";
import { ContactOwnerSelect } from "@/components/ui/ContactOwnerSelect";
import { ChannelMultiSelect } from "@/components/ui/ChannelMultiSelect";
import { AssetUploadField } from "@/components/content/AssetUploadField";
import { cn } from "@/lib/utils";
import {
  CHANNELS,
  CONTENT_CATEGORIES,
  CONTENT_PRIORITIES,
  CONTENT_TYPES,
  optionsForField,
  selectOptionsWithCurrent,
  type FieldOption,
} from "@/lib/data/collections";
import {
  useCreatableSelectOptions,
  useManagedFieldOptions,
} from "@/lib/data/useManagedFieldOptions";
import { isSocialContentItem } from "@/lib/data/normalize";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { RichTextView } from "@/components/ui/RichTextView";
import { plainTextFromHtml } from "@/lib/plain-text";
import { RelatedTasksPanel } from "@/components/tasks/RelatedTasksPanel";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { RecordDrawer } from "@/components/ui/RecordDrawer";

const STATUS_LABEL: Record<ThemeStatus, string> = {
  previous: "Previous",
  active: "Active",
  upcoming: "Upcoming",
};

const CONTENT_STATUS_OPTIONS: { id: ContentStatus; label: string }[] = [
  { id: "idea", label: "Idea" },
  { id: "draft", label: "Draft" },
  { id: "review", label: "Approved" },
  { id: "scheduled", label: "Scheduled" },
  { id: "published", label: "Published" },
  { id: "cancelled", label: "Cancelled" },
];

type ThemeEditForm = {
  title: string;
  summary: string;
  quarter: QuarterlyTheme["quarter"];
  year: string;
  status: ThemeStatus;
};

type ContentEditForm = {
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
  owner: string;
  status: ContentStatus;
};

function themeToForm(theme: QuarterlyTheme): ThemeEditForm {
  return {
    title: theme.title,
    summary: theme.summary,
    quarter: theme.quarter,
    year: String(theme.year),
    status: theme.status,
  };
}

function contentToForm(item: ContentItem): ContentEditForm {
  return {
    title: item.title,
    channel: Array.isArray(item.channel)
      ? item.channel
      : item.channel
        ? [String(item.channel)]
        : [],
    content_type: item.content_type || "Editorial",
    due_date: item.due_date ?? "",
    deadline_date: item.deadline_date ?? "",
    category: item.category ?? "",
    priority: item.priority ?? "",
    website: item.website ?? "",
    caption: item.caption ?? "",
    notes: item.notes,
    planable_url: item.planable_url,
    asset_url: item.asset_url,
    owner: item.owner,
    status: item.status,
  };
}

function pickDefaultTheme(list: QuarterlyTheme[]) {
  return list.find((t) => t.status === "active") ?? list[0] ?? null;
}

function uniqueYears(list: QuarterlyTheme[]) {
  return Array.from(new Set(list.map((t) => t.year))).sort((a, b) => a - b);
}

export function ThemesClient({
  initialThemes,
  initialMains,
  initialOffshoots,
  initialContent,
  contentFieldOptions: contentFieldOptionsProp,
}: {
  initialThemes: QuarterlyTheme[];
  initialMains: ThemeMainContent[];
  initialOffshoots: ThemeOffshoot[];
  initialContent: ContentItem[];
  /** Content collection Field Manager options (shared with Content page). */
  contentFieldOptions?: Record<string, FieldOption[]>;
}) {
  const contentFieldOptions = useManagedFieldOptions(
    "content",
    contentFieldOptionsProp
  );
  const channelOptions = optionsForField(
    contentFieldOptions,
    "channel",
    CHANNELS
  );
  const contentTypeOptions = optionsForField(
    contentFieldOptions,
    "content_type",
    CONTENT_TYPES
  );
  const { options: categoryOptions, addOption: addCategoryOption } =
    useCreatableSelectOptions(
      "content",
      "category",
      contentFieldOptions,
      CONTENT_CATEGORIES
    );
  const priorityOptions = optionsForField(
    contentFieldOptions,
    "priority",
    CONTENT_PRIORITIES
  );

  const [themes, setThemes] = useState(initialThemes);
  const [mains, setMains] = useState(initialMains);
  const [offshoots, setOffshoots] = useState(initialOffshoots);
  const [content, setContent] = useState(initialContent);
  const initialSelected = pickDefaultTheme(initialThemes);
  const [selectedId, setSelectedId] = useState<string | null>(
    () => initialSelected?.id ?? null
  );
  const [yearTab, setYearTab] = useState<number>(() => {
    if (initialSelected) return initialSelected.year;
    const years = uniqueYears(initialThemes);
    return years[0] ?? new Date().getFullYear();
  });
  const [themeEdit, setThemeEdit] = useState<ThemeEditForm | null>(() =>
    initialSelected ? themeToForm(initialSelected) : null
  );
  const [savingTheme, setSavingTheme] = useState(false);
  const [mainForm, setMainForm] = useState({ title: "", channel: "", owner: "" });
  const [offshootFor, setOffshootFor] = useState<string | null>(null);
  const [offshootForm, setOffshootForm] = useState({
    title: "",
    channel: "",
    owner: "",
  });
  const [editingMainId, setEditingMainId] = useState<string | null>(null);
  const [editingContentId, setEditingContentId] = useState<string | null>(null);
  const [contentEdit, setContentEdit] = useState<ContentEditForm | null>(null);
  const [savingContent, setSavingContent] = useState(false);
  const [openingContent, setOpeningContent] = useState(false);
  const [addingMain, setAddingMain] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/themes");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        typeof data.error === "string" ? data.error : "Could not refresh themes"
      );
    }
    setThemes(data.themes ?? []);
    setMains(data.mains ?? []);
    setOffshoots(data.offshoots ?? []);
    setContent(data.content ?? []);
  }, []);

  useEffect(() => {
    void refresh().catch((e) => {
      setError(e instanceof Error ? e.message : "Could not refresh themes");
    });
  }, [refresh]);

  const years = useMemo(() => uniqueYears(themes), [themes]);

  const yearThemes = useMemo(
    () => themes.filter((t) => t.year === yearTab),
    [themes, yearTab]
  );

  const selected = useMemo(
    () => themes.find((t) => t.id === selectedId) ?? null,
    [themes, selectedId]
  );

  useEffect(() => {
    if (years.length === 0) return;
    if (!years.includes(yearTab)) {
      setYearTab(years[0]);
    }
  }, [years, yearTab]);

  useEffect(() => {
    if (yearThemes.length === 0) {
      setSelectedId(null);
      return;
    }
    const stillVisible = yearThemes.some((t) => t.id === selectedId);
    if (!stillVisible) {
      setSelectedId(pickDefaultTheme(yearThemes)?.id ?? null);
    }
  }, [yearThemes, selectedId]);

  useEffect(() => {
    if (selected) setThemeEdit(themeToForm(selected));
    else setThemeEdit(null);
  }, [selected]);

  const selectedMains = useMemo(
    () => mains.filter((m) => m.theme_id === selectedId),
    [mains, selectedId]
  );

  const contentById = useMemo(() => {
    const map = new Map<string, ContentItem>();
    for (const item of content) map.set(item.id, item);
    return map;
  }, [content]);

  function selectYear(year: number) {
    setYearTab(year);
    const inYear = themes.filter((t) => t.year === year);
    setSelectedId(pickDefaultTheme(inYear)?.id ?? null);
  }

  const themeDirty = useMemo(() => {
    if (!selected || !themeEdit) return false;
    return (
      themeEdit.title !== selected.title ||
      themeEdit.summary !== selected.summary ||
      themeEdit.quarter !== selected.quarter ||
      themeEdit.year !== String(selected.year) ||
      themeEdit.status !== selected.status
    );
  }, [selected, themeEdit]);

  async function addMain() {
    if (!selectedId || !mainForm.title.trim()) return;
    setAddingMain(true);
    setError(null);
    try {
      const res = await fetch("/api/themes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "main",
          theme_id: selectedId,
          ...mainForm,
          status: "idea",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Could not save main content. Please try again."
        );
        return;
      }
      setMainForm({ title: "", channel: "", owner: "" });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save main content.");
    } finally {
      setAddingMain(false);
    }
  }

  async function addOffshoot(mainId: string) {
    if (!offshootForm.title.trim()) return;
    setError(null);
    try {
      const res = await fetch("/api/themes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "offshoot",
          main_content_id: mainId,
          ...offshootForm,
          status: "idea",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Could not save offshoot. Please try again."
        );
        return;
      }
      setOffshootForm({ title: "", channel: "", owner: "" });
      setOffshootFor(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save offshoot.");
    }
  }

  async function saveTheme() {
    if (!selectedId || !themeEdit || !themeEdit.title.trim()) return;
    const year = Number.parseInt(themeEdit.year, 10);
    if (!Number.isFinite(year) || year < 2000 || year > 2100) return;
    setSavingTheme(true);
    setError(null);
    try {
      const res = await fetch("/api/themes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          entity: "theme",
          id: selectedId,
          patch: {
            title: themeEdit.title.trim(),
            summary: themeEdit.summary.trim(),
            quarter: themeEdit.quarter,
            year,
            status: themeEdit.status,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Could not save theme. Please try again."
        );
        return;
      }
      setYearTab(year);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save theme.");
    } finally {
      setSavingTheme(false);
    }
  }

  async function removeTheme(id: string) {
    if (
      !window.confirm(
        "Delete this quarterly theme? Main content and offshoots under it will also be removed."
      )
    ) {
      return;
    }
    await fetch("/api/themes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", entity: "theme", id }),
    });
    const res = await fetch("/api/themes");
    const data = await res.json();
    const nextThemes = (data.themes ?? []) as QuarterlyTheme[];
    setThemes(nextThemes);
    setMains(data.mains ?? []);
    setOffshoots(data.offshoots ?? []);
    setContent(data.content ?? []);
    const remainingInYear = nextThemes.filter((t) => t.year === yearTab);
    if (remainingInYear.length > 0) {
      setSelectedId((current) => {
        if (current !== id) return current;
        return pickDefaultTheme(remainingInYear)?.id ?? null;
      });
    } else {
      const nextYears = uniqueYears(nextThemes);
      const nextYear = nextYears.includes(yearTab)
        ? yearTab
        : nextYears[0] ?? yearTab;
      setYearTab(nextYear);
      setSelectedId(
        pickDefaultTheme(nextThemes.filter((t) => t.year === nextYear))?.id ??
          null
      );
    }
  }

  async function openMainContent(main: ThemeMainContent) {
    setOpeningContent(true);
    try {
      let item =
        (main.content_id && contentById.get(main.content_id)) || null;
      if (!item) {
        const res = await fetch("/api/themes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "ensureContent", id: main.id }),
        });
        const data = await res.json();
        if (!res.ok || !data.content) return;
        item = data.content as ContentItem;
        await refresh();
      }
      setEditingMainId(main.id);
      setEditingContentId(item.id);
      setContentEdit(contentToForm(item));
    } finally {
      setOpeningContent(false);
    }
  }

  function closeContentEdit() {
    setEditingMainId(null);
    setEditingContentId(null);
    setContentEdit(null);
  }

  async function saveContentEdit() {
    if (!editingContentId || !contentEdit) return;
    setSavingContent(true);
    setError(null);
    try {
      const res = await fetch("/api/themes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateContent",
          id: editingContentId,
          patch: {
            title: contentEdit.title.trim() || "Untitled",
            channel: contentEdit.channel.length
              ? contentEdit.channel
              : ["Editorial"],
            content_type: contentEdit.content_type.trim() || "Editorial",
            due_date: contentEdit.due_date || null,
            deadline_date: contentEdit.deadline_date || null,
            category: contentEdit.category,
            priority: contentEdit.priority,
            website: contentEdit.website,
            caption: contentEdit.caption,
            notes: contentEdit.notes,
            planable_url: contentEdit.planable_url,
            asset_url: contentEdit.asset_url,
            owner: contentEdit.owner,
            status: contentEdit.status,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Could not save content. Please try again."
        );
        return;
      }
      await refresh();
      closeContentEdit();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save content.");
    } finally {
      setSavingContent(false);
    }
  }

  async function setItemStatus(
    entity: "main" | "offshoot",
    id: string,
    status: ContentStatus
  ) {
    await fetch("/api/themes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update",
        entity,
        id,
        patch: { status },
      }),
    });
    await refresh();
  }

  async function remove(entity: "main" | "offshoot", id: string) {
    await fetch("/api/themes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", entity, id }),
    });
    if (entity === "main" && editingMainId === id) closeContentEdit();
    await refresh();
  }

  return (
    <div>
      <PageHeader
        title="Quarterly themes"
        description="Theme → main content → offshoot pieces. Plan the quarter’s spine, then branch social and supporting assets."
        actions={
          <Link href="/app/content" className="btn-secondary">
            <ExternalLink className="h-4 w-4" />
            Content table
          </Link>
        }
      />

      {error ? (
        <div
          className="mb-4 rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-4 py-3 text-sm text-[var(--danger)]"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {years.length > 0 ? (
        <div
          className="mb-5 inline-flex flex-wrap gap-1 rounded-2xl border border-border bg-white p-1"
          role="tablist"
          aria-label="Theme years"
        >
          {years.map((year) => (
            <button
              key={year}
              type="button"
              role="tab"
              aria-selected={yearTab === year}
              className={cn(
                "rounded-xl px-3.5 py-2 text-sm font-medium transition",
                yearTab === year
                  ? "bg-brand text-white shadow-sm"
                  : "text-muted hover:bg-sand hover:text-foreground"
              )}
              onClick={() => selectYear(year)}
            >
              {year}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {yearThemes.map((theme) => {
          const active = theme.id === selectedId;
          const count = mains.filter((m) => m.theme_id === theme.id).length;
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => setSelectedId(theme.id)}
              className={cn(
                "surface-card p-4 text-left transition hover:-translate-y-0.5",
                active && "border-accent ring-2 ring-accent/20"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {theme.quarter} · {theme.year}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-medium",
                    theme.status === "active"
                      ? "bg-accent-soft text-brand"
                      : "bg-sand text-muted"
                  )}
                >
                  {STATUS_LABEL[theme.status]}
                </span>
              </div>
              <h2 className="mt-2 font-display text-lg text-brand">{theme.title}</h2>
              {plainTextFromHtml(theme.summary) ? (
                <RichTextView
                  html={theme.summary}
                  plain
                  clampLines={2}
                  className="mt-1 text-xs text-muted"
                />
              ) : null}
              <p className="mt-3 text-xs text-muted">{count} main pieces</p>
            </button>
          );
        })}
        {yearThemes.length === 0 ? (
          <div className="col-span-full">
            <EmptyState
              title={`No themes for ${yearTab} yet`}
              description="Create a quarterly theme to link content mains and offshoots."
            />
          </div>
        ) : null}
      </div>

      {selected && themeEdit ? (
        <div className="space-y-6">
          <div className="surface-card p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Theme
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={savingTheme || !themeDirty || !themeEdit.title.trim()}
                  onClick={() => void saveTheme()}
                >
                  {savingTheme ? "Saving…" : "Save theme"}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={!themeDirty}
                  onClick={() => setThemeEdit(themeToForm(selected))}
                >
                  Reset
                </button>
                <button
                  type="button"
                  className="text-xs text-[var(--danger)]"
                  onClick={() => void removeTheme(selected.id)}
                >
                  Delete theme
                </button>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-[120px_100px_160px]">
              <SearchSelect
                className="field"
                value={themeEdit.quarter}
                onChange={(quarter) =>
                  setThemeEdit({
                    ...themeEdit,
                    quarter: quarter as QuarterlyTheme["quarter"],
                  })
                }
                aria-label="Quarter"
                options={[
                  { value: "Q1", label: "Q1" },
                  { value: "Q2", label: "Q2" },
                  { value: "Q3", label: "Q3" },
                  { value: "Q4", label: "Q4" },
                ]}
              />
              <input
                className="field"
                type="number"
                min={2000}
                max={2100}
                value={themeEdit.year}
                onChange={(e) =>
                  setThemeEdit({ ...themeEdit, year: e.target.value })
                }
                aria-label="Year"
              />
              <SearchSelect
                className="field"
                value={themeEdit.status}
                onChange={(status) =>
                  setThemeEdit({
                    ...themeEdit,
                    status: status as ThemeStatus,
                  })
                }
                aria-label="Status"
                options={[
                  { value: "previous", label: "Previous" },
                  { value: "active", label: "Active" },
                  { value: "upcoming", label: "Upcoming" },
                ]}
              />
            </div>
            <input
              className="field mt-3"
              value={themeEdit.title}
              onChange={(e) =>
                setThemeEdit({ ...themeEdit, title: e.target.value })
              }
              placeholder="Theme title"
              aria-label="Theme title"
            />
            <RichTextEditor
              className="mt-3"
              value={themeEdit.summary}
              onChange={(summary) =>
                setThemeEdit({ ...themeEdit, summary })
              }
              placeholder="Theme summary"
              minHeight="88px"
            />
            <RelatedTasksPanel
              className="mt-4"
              relatedType="theme"
              relatedId={selectedId}
            />
          </div>

          <div className="surface-card p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Main content
                </p>
                <h3 className="font-display text-xl text-brand">Core pieces</h3>
                <p className="mt-1 text-xs text-muted">
                  Each piece links to the Content table — open it to add due dates,
                  Planable links, and attachments.
                </p>
              </div>
            </div>

            <div className="mb-4 grid gap-2 md:grid-cols-[1fr_160px_140px_auto]">
              <input
                className="field"
                placeholder="Main content title"
                value={mainForm.title}
                onChange={(e) => setMainForm({ ...mainForm, title: e.target.value })}
              />
              <SearchSelect
                className="field"
                value={mainForm.channel}
                allowEmpty
                emptyLabel="Channel"
                placeholder="Channel"
                onChange={(channel) =>
                  setMainForm({ ...mainForm, channel })
                }
                options={channelOptions}
              />
              <ContactOwnerSelect
                className="field"
                value={mainForm.owner}
                onChange={(owner) => setMainForm({ ...mainForm, owner })}
              />
              <button
                type="button"
                className="btn-primary"
                disabled={addingMain || !mainForm.title.trim()}
                onClick={() => void addMain()}
              >
                <Plus className="h-4 w-4" />
                {addingMain ? "Saving…" : "Add"}
              </button>
            </div>

            <div className="space-y-4">
              {selectedMains.map((main) => {
                const kids = offshoots.filter((o) => o.main_content_id === main.id);
                const linked =
                  (main.content_id && contentById.get(main.content_id)) || null;
                return (
                  <article
                    key={main.id}
                    className="rounded-2xl border border-border bg-sand/40 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <button
                          type="button"
                          className="text-left font-medium text-brand hover:underline"
                          disabled={openingContent}
                          onClick={() => void openMainContent(main)}
                        >
                          {main.title}
                        </button>
                        <p className="text-xs text-muted">
                          {main.channel || "No channel"}
                          {main.owner ? ` · ${main.owner}` : ""}
                          {linked?.due_date ? ` · due ${linked.due_date}` : ""}
                        </p>
                        {linked?.asset_url ? (
                          <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted">
                            <Paperclip className="h-3 w-3" />
                            Attachment
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <SearchSelect
                          className="field w-auto py-1.5 text-xs"
                          value={main.status}
                          onChange={(status) =>
                            void setItemStatus(
                              "main",
                              main.id,
                              status as ContentStatus
                            )
                          }
                          options={CONTENT_STATUS_OPTIONS.map((s) => ({
                            value: s.id,
                            label: s.label,
                          }))}
                        />
                        <button
                          type="button"
                          className="btn-secondary py-1.5 text-xs"
                          disabled={openingContent}
                          onClick={() => void openMainContent(main)}
                        >
                          Edit content
                        </button>
                        <button
                          type="button"
                          className="btn-secondary py-1.5 text-xs"
                          onClick={() =>
                            setOffshootFor(offshootFor === main.id ? null : main.id)
                          }
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Offshoot
                        </button>
                        <button
                          type="button"
                          className="text-xs text-[var(--danger)]"
                          onClick={() => void remove("main", main.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {kids.length > 0 ? (
                      <ul className="mt-3 space-y-2 border-l-2 border-accent/40 pl-4">
                        {kids.map((kid) => (
                          <li
                            key={kid.id}
                            className="flex flex-wrap items-start justify-between gap-2 rounded-xl bg-white px-3 py-2"
                          >
                            <div className="flex items-start gap-2">
                              <CornerDownRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
                              <div>
                                <p className="text-sm font-medium">{kid.title}</p>
                                <p className="text-xs text-muted">
                                  {kid.channel || "Offshoot"}
                                  {kid.owner ? ` · ${kid.owner}` : ""}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <SearchSelect
                                className="field w-auto py-1 text-xs"
                                value={kid.status}
                                onChange={(status) =>
                                  void setItemStatus(
                                    "offshoot",
                                    kid.id,
                                    status as ContentStatus
                                  )
                                }
                                options={CONTENT_STATUS_OPTIONS.map((s) => ({
                                  value: s.id,
                                  label: s.label,
                                }))}
                              />
                              <button
                                type="button"
                                className="text-xs text-[var(--danger)]"
                                onClick={() => void remove("offshoot", kid.id)}
                              >
                                Delete
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-xs text-muted">
                        No offshoots yet — add social cuts, quotes, or supporting posts.
                      </p>
                    )}

                    {offshootFor === main.id ? (
                      <div className="mt-3 grid gap-2 md:grid-cols-[1fr_140px_120px_auto]">
                        <input
                          className="field"
                          placeholder="Offshoot title"
                          value={offshootForm.title}
                          onChange={(e) =>
                            setOffshootForm({
                              ...offshootForm,
                              title: e.target.value,
                            })
                          }
                        />
                        <SearchSelect
                          className="field"
                          value={offshootForm.channel}
                          allowEmpty
                          emptyLabel="Channel"
                          placeholder="Channel"
                          onChange={(channel) =>
                            setOffshootForm({
                              ...offshootForm,
                              channel,
                            })
                          }
                          options={selectOptionsWithCurrent(
                            channelOptions,
                            offshootForm.channel
                          )}
                        />
                        <ContactOwnerSelect
                          value={offshootForm.owner}
                          onChange={(owner) =>
                            setOffshootForm({
                              ...offshootForm,
                              owner,
                            })
                          }
                        />
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => void addOffshoot(main.id)}
                        >
                          Save
                        </button>
                      </div>
                    ) : null}
                  </article>
                );
              })}

              {selectedMains.length === 0 ? (
                <p className="text-sm text-muted">
                  Add the main content pieces that carry this theme, then branch
                  offshoots underneath.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted">Select a quarter theme to plan content.</p>
      )}

      {contentEdit && editingMainId ? (
        <RecordDrawer
          open
          onClose={closeContentEdit}
          title="Edit content"
          ariaLabel="Edit content piece"
          subtitle="Synced with the Content table"
          footer={
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary"
                disabled={savingContent}
                onClick={() => void saveContentEdit()}
              >
                {savingContent ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={savingContent}
                onClick={closeContentEdit}
              >
                Cancel
              </button>
              <Link
                href="/app/content"
                className="btn-ghost text-xs"
                onClick={closeContentEdit}
              >
                Open Content table
              </Link>
            </div>
          }
        >
              <div className="grid gap-2">
                <div>
                  <label className="label">Title</label>
                  <input
                    className="field"
                    value={contentEdit.title}
                    onChange={(e) =>
                      setContentEdit({ ...contentEdit, title: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="label">Content type</label>
                  <SearchSelect
                    className="field"
                    value={contentEdit.content_type}
                    onChange={(content_type) =>
                      setContentEdit({
                        ...contentEdit,
                        content_type,
                      })
                    }
                    options={selectOptionsWithCurrent(
                      contentTypeOptions,
                      contentEdit.content_type
                    )}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Channels</label>
                  <ChannelMultiSelect
                    value={contentEdit.channel}
                    options={channelOptions}
                    onChange={(channel) =>
                      setContentEdit({ ...contentEdit, channel })
                    }
                  />
                </div>
                <div>
                  <label className="label">Owner</label>
                  <ContactOwnerSelect
                    className="field"
                    value={contentEdit.owner}
                    onChange={(owner) =>
                      setContentEdit({ ...contentEdit, owner })
                    }
                  />
                </div>
                <div>
                  <label className="label">Date</label>
                  <input
                    className="field"
                    type="date"
                    value={contentEdit.due_date}
                    onChange={(e) =>
                      setContentEdit({
                        ...contentEdit,
                        due_date: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="label">Deadline</label>
                  <input
                    className="field"
                    type="date"
                    value={contentEdit.deadline_date}
                    onChange={(e) =>
                      setContentEdit({
                        ...contentEdit,
                        deadline_date: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="label">Category</label>
                  <SearchSelect
                    className="field"
                    value={contentEdit.category}
                    allowEmpty
                    emptyLabel="Select…"
                    placeholder="Select…"
                    searchPlaceholder="Search or add a category…"
                    noResultsLabel="No matches — add it as a new category"
                    allowCreate
                    createLabel={(query) => `Add “${query}”`}
                    onCreate={(name) => {
                      const category = addCategoryOption(name);
                      if (category) {
                        setContentEdit({
                          ...contentEdit,
                          category,
                        });
                      }
                    }}
                    onChange={(category) =>
                      setContentEdit({
                        ...contentEdit,
                        category,
                      })
                    }
                    options={selectOptionsWithCurrent(
                      categoryOptions,
                      contentEdit.category
                    )}
                  />
                </div>
                <div>
                  <label className="label">Priority</label>
                  <SearchSelect
                    className="field"
                    value={contentEdit.priority}
                    allowEmpty
                    emptyLabel="None"
                    placeholder="None"
                    onChange={(priority) =>
                      setContentEdit({
                        ...contentEdit,
                        priority,
                      })
                    }
                    options={selectOptionsWithCurrent(
                      priorityOptions,
                      contentEdit.priority
                    )}
                  />
                </div>
                <div>
                  <label className="label">Status</label>
                  <SearchSelect
                    className="field"
                    value={contentEdit.status}
                    onChange={(status) =>
                      setContentEdit({
                        ...contentEdit,
                        status: status as ContentStatus,
                      })
                    }
                    options={CONTENT_STATUS_OPTIONS.map((c) => ({
                      value: c.id,
                      label: c.label,
                    }))}
                  />
                </div>
                <div>
                  <label className="label">Website / publication URL</label>
                  <input
                    className="field"
                    type="url"
                    placeholder="https://"
                    value={contentEdit.website}
                    onChange={(e) =>
                      setContentEdit({
                        ...contentEdit,
                        website: e.target.value,
                      })
                    }
                  />
                </div>
                {isSocialContentItem({
                  content_type: contentEdit.content_type,
                  channel: contentEdit.channel,
                }) ? (
                  <>
                    <div className="sm:col-span-2">
                      <label className="label">Caption / post text</label>
                      <RichTextEditor
                        value={contentEdit.caption}
                        onChange={(caption) =>
                          setContentEdit({
                            ...contentEdit,
                            caption,
                          })
                        }
                        placeholder="Caption / post text…"
                        minHeight="70px"
                      />
                    </div>
                    <div>
                      <label className="label">Planable URL</label>
                      <input
                        className="field"
                        value={contentEdit.planable_url}
                        onChange={(e) =>
                          setContentEdit({
                            ...contentEdit,
                            planable_url: e.target.value,
                          })
                        }
                      />
                    </div>
                  </>
                ) : null}
                <div className="sm:col-span-2">
                  <label className="label">Notes</label>
                  <RichTextEditor
                    value={contentEdit.notes}
                    onChange={(notes) =>
                      setContentEdit({ ...contentEdit, notes })
                    }
                    placeholder="Notes…"
                    minHeight="70px"
                  />
                </div>
                <AssetUploadField
                  multiple
                  value={contentEdit.asset_url}
                  onChange={(asset_url) =>
                    setContentEdit({ ...contentEdit, asset_url })
                  }
                />
                <RelatedTasksPanel
                  className="mt-4"
                  relatedType="content"
                  relatedId={editingContentId}
                />
              </div>
        </RecordDrawer>
      ) : null}
    </div>
  );
}
