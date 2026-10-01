"use client";

import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import { format, parseISO, isBefore, startOfDay, addDays } from "date-fns";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import type { HubTask, TaskRelatedType, TaskStatus } from "@/lib/types";
import { PageHeader, EmptyState } from "@/components/ui/PageHeader";
import { RecordDrawer } from "@/components/ui/RecordDrawer";
import { StatusPill } from "@/components/ui/StatusPill";
import { FullCalendarStyles } from "@/components/ui/FullCalendarStyles";
import { FilterBar, matchesSearch } from "@/components/ui/FilterBar";
import { ContactOwnerSelect } from "@/components/ui/ContactOwnerSelect";
import { TimelineChart } from "@/components/ui/TimelineChart";
import { cn } from "@/lib/utils";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { RichTextView } from "@/components/ui/RichTextView";
import { useHubDataRefresh } from "@/lib/command/refresh";
import { plainTextFromHtml } from "@/lib/plain-text";
import {
  TASK_CATEGORIES,
  TASK_STATUSES,
  isClosedTaskStatus,
  optionsForField,
  selectOptionsWithCurrent,
  type FieldOption,
} from "@/lib/data/collections";
import { useManagedFieldOptions } from "@/lib/data/useManagedFieldOptions";
import {
  TaskRelatedChip,
  TaskRelatedFields,
} from "@/components/tasks/TaskRelatedFields";
import { SearchSelect } from "@/components/ui/SearchSelect";

const VIEWS = [
  { id: "kanban", label: "Kanban" },
  { id: "list", label: "List" },
  { id: "calendar", label: "Calendar" },
  { id: "timeline", label: "Timeline" },
] as const;

type ViewId = (typeof VIEWS)[number]["id"];

const emptyForm = {
  title: "",
  details: "",
  start_date: "",
  due_date: "",
  category: "Events",
  status: "todo" as TaskStatus,
  owner: "",
  related_type: "" as TaskRelatedType | "",
  related_id: null as string | null,
};

type EditForm = typeof emptyForm;

function toEditForm(item: HubTask): EditForm {
  return {
    title: item.title,
    details: item.details,
    start_date: item.start_date ?? "",
    due_date: item.due_date ?? "",
    category: item.category,
    status: item.status,
    owner: item.owner,
    related_type: item.related_type || "",
    related_id: item.related_id ?? null,
  };
}

function parseDay(value: string | null | undefined): Date | null {
  if (!value) return null;
  try {
    return parseISO(value.slice(0, 10));
  } catch {
    return null;
  }
}

function formatTaskSchedule(item: HubTask): string | null {
  const from = parseDay(item.start_date);
  const deadline = parseDay(item.due_date);
  try {
    if (from && deadline) {
      return `${format(from, "d MMM yyyy")} → ${format(deadline, "d MMM yyyy")}`;
    }
    if (deadline) return `Deadline ${format(deadline, "d MMM yyyy")}`;
    if (from) return `From ${format(from, "d MMM yyyy")}`;
  } catch {
    return null;
  }
  return null;
}

function statusDotColor(status: TaskStatus) {
  const s = status.trim().toLowerCase();
  if (isClosedTaskStatus(s)) return "#059669";
  if (
    s === "doing" ||
    s === "inprogress" ||
    s.includes("progress") ||
    s.includes("wait")
  ) {
    return "#0284c7";
  }
  return "#d97706";
}

function statusTone(status: TaskStatus) {
  const s = status.trim().toLowerCase();
  if (isClosedTaskStatus(s)) {
    return "bg-emerald-50 text-emerald-800 border-emerald-200";
  }
  if (
    s === "doing" ||
    s === "inprogress" ||
    s.includes("progress") ||
    s.includes("wait")
  ) {
    return "bg-sky-50 text-sky-800 border-sky-200";
  }
  return "bg-amber-50 text-amber-900 border-amber-200";
}

function isOverdue(item: HubTask) {
  if (!item.due_date || isClosedTaskStatus(item.status)) return false;
  try {
    return isBefore(parseISO(item.due_date), startOfDay(new Date()));
  } catch {
    return false;
  }
}

export function TasksClient({
  initial,
  fieldOptions: fieldOptionsProp,
}: {
  initial: HubTask[];
  fieldOptions?: Record<string, FieldOption[]>;
}) {
  const fieldOptions = useManagedFieldOptions("tasks", fieldOptionsProp);
  const categoryOptions = optionsForField(
    fieldOptions,
    "category",
    TASK_CATEGORIES
  );
  const statusOptions = optionsForField(
    fieldOptions,
    "status",
    TASK_STATUSES
  );
  const [items, setItems] = useState(initial);
  const statusColumns = useMemo(() => {
    const cols = statusOptions.map((o) => ({ id: o.value, label: o.label }));
    const known = new Set(cols.map((c) => c.id));
    for (const item of items) {
      const status = item.status?.trim();
      if (status && !known.has(status)) {
        known.add(status);
        cols.push({ id: status, label: status });
      }
    }
    return cols;
  }, [statusOptions, items]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [view, setView] = useState<ViewId>("kanban");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<TaskStatus | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/tasks");
    if (!res.ok) return;
    const data = await res.json();
    setItems(data.tasks ?? []);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useHubDataRefresh("tasks", () => {
    void refresh();
  });

  const owners = useMemo(() => {
    const set = new Set(items.map((i) => i.owner.trim()).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (
        !matchesSearch(search, [
          item.title,
          plainTextFromHtml(item.details),
          item.category,
          item.owner,
          item.status,
        ])
      ) {
        return false;
      }
      if (statusFilter === "open" && isClosedTaskStatus(item.status))
        return false;
      if (
        statusFilter !== "all" &&
        statusFilter !== "open" &&
        item.status !== statusFilter
      ) {
        return false;
      }
      if (ownerFilter !== "all" && item.owner !== ownerFilter) return false;
      return true;
    });
  }, [items, search, statusFilter, ownerFilter]);

  const calendarEvents = useMemo(
    () =>
      filtered
        .filter((i) => i.due_date || i.start_date)
        .map((i) => {
          const hasRange =
            Boolean(i.start_date && i.due_date) &&
            i.start_date! <= i.due_date!;
          return {
            id: i.id,
            title: i.title,
            start: (i.start_date || i.due_date) as string,
            ...(hasRange
              ? {
                  end: format(
                    addDays(parseISO(i.due_date!), 1),
                    "yyyy-MM-dd"
                  ),
                }
              : {}),
            allDay: true,
            extendedProps: { itemId: i.id },
          };
        }),
    [filtered]
  );

  const calendarItemById = useMemo(() => {
    const map = new Map<string, HubTask>();
    for (const i of filtered) map.set(i.id, i);
    return map;
  }, [filtered]);

  const timelineItems = useMemo(() => {
    return filtered
      .map((item) => {
        const due = parseDay(item.due_date);
        const from = parseDay(item.start_date);
        if (!due && !from) return null;
        const end = due ?? from!;
        const start =
          from && from.getTime() <= end.getTime()
            ? from
            : addDays(end, -5);
        const statusLabel =
          statusColumns.find((s) => s.id === item.status)?.label ?? item.status;
        return {
          id: item.id,
          label: item.title,
          subtitle: [statusLabel, item.category, item.owner]
            .filter(Boolean)
            .join(" · "),
          start,
          end,
          color: statusDotColor(item.status),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [filtered, statusColumns]);

  const undatedCount = useMemo(
    () => filtered.filter((i) => !i.due_date && !i.start_date).length,
    [filtered]
  );

  async function create() {
    if (creating) return;
    setCreating(true);
    setFormError(null);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          title: form.title.trim() || "Untitled task",
          start_date: form.start_date || null,
          due_date: form.due_date || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(
          typeof data.error === "string" ? data.error : "Could not save task"
        );
        return;
      }
      if (data.item) {
        setItems((prev) => {
          if (prev.some((t) => t.id === data.item.id)) return prev;
          return [...prev, data.item as HubTask];
        });
      }
      setShowForm(false);
      setForm(emptyForm);
      await refresh();
    } catch {
      setFormError("Could not save task");
    } finally {
      setCreating(false);
    }
  }

  async function saveEdit() {
    if (!editingId || !edit) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: editingId,
          patch: {
            title: edit.title.trim() || "Untitled task",
            details: edit.details,
            start_date: edit.start_date || null,
            due_date: edit.due_date || null,
            category: edit.category,
            status: edit.status,
            owner: edit.owner,
            related_type: edit.related_type || "",
            related_id: edit.related_id || null,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(
          typeof data.error === "string" ? data.error : "Could not save changes"
        );
        return;
      }
      setEditingId(null);
      setEdit(null);
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(id: string, status: TaskStatus) {
    const previous = items.find((i) => i.id === id)?.status;
    if (previous === status) return;
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status } : item))
    );
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id, patch: { status } }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      await refresh();
    } catch {
      if (previous !== undefined) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, status: previous } : item
          )
        );
      } else {
        await refresh();
      }
    }
  }

  async function setOwner(id: string, owner: string) {
    const previous = items.find((i) => i.id === id)?.owner;
    if (previous === owner) return;
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, owner } : item))
    );
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id, patch: { owner } }),
      });
      if (!res.ok) throw new Error("Failed to update owner");
      await refresh();
    } catch {
      if (previous !== undefined) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, owner: previous } : item
          )
        );
      } else {
        await refresh();
      }
    }
  }

  async function setTaskDates(
    id: string,
    startDate: string | null,
    dueDate: string | null
  ) {
    const previous = items.find((i) => i.id === id);
    const prevStart = previous?.start_date ?? null;
    const prevDue = previous?.due_date ?? null;
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, start_date: startDate, due_date: dueDate }
          : item
      )
    );
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id,
          patch: { start_date: startDate, due_date: dueDate },
        }),
      });
      if (!res.ok) throw new Error("Failed to update dates");
      await refresh();
    } catch {
      setItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, start_date: prevStart, due_date: prevDue }
            : item
        )
      );
      throw new Error("Failed to update dates");
    }
  }

  function openEdit(item: HubTask) {
    setEditingId(item.id);
    setEdit(toEditForm(item));
  }

  function onCardDragStart(e: DragEvent, id: string) {
    const target = e.target as HTMLElement;
    if (target.closest("button, select, input, a, textarea")) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
    setDraggingId(id);
  }

  function onCardDragEnd() {
    setDraggingId(null);
    setDropTarget(null);
  }

  function onColumnDragOver(e: DragEvent, status: TaskStatus) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dropTarget !== status) setDropTarget(status);
  }

  function onColumnDragLeave(e: DragEvent, status: TaskStatus) {
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    if (dropTarget === status) setDropTarget(null);
  }

  function onColumnDrop(e: DragEvent, status: TaskStatus) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    setDraggingId(null);
    setDropTarget(null);
    if (!id) return;
    void setStatus(id, status);
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this task?")) return;
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    if (editingId === id) {
      setEditingId(null);
      setEdit(null);
    }
    await refresh();
  }

  return (
    <div>
      <PageHeader
        title="Tasks"
        description="Marketing to-dos — Kanban, list, calendar, or timeline by From / Deadline."
        actions={
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setFormError(null);
              setShowForm(true);
            }}
          >
            Add task
          </button>
        }
      />

      <FullCalendarStyles />

      <div
        className="mb-5 inline-flex flex-wrap gap-1 rounded-2xl border border-border bg-white p-1"
        role="tablist"
        aria-label="Tasks views"
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
            onClick={() => {
              setView(v.id);
              if (v.id === "kanban" && statusFilter === "open") {
                setStatusFilter("all");
              }
            }}
          >
            {v.label}
          </button>
        ))}
      </div>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search tasks…"
        resultCount={filtered.length}
        totalCount={items.length}
        selects={[
          {
            id: "status",
            label: "Status",
            value: statusFilter,
            onChange: setStatusFilter,
            options: [
              { value: "open", label: "Open (not completed)" },
              { value: "all", label: "All statuses" },
              ...statusColumns.map((s) => ({ value: s.id, label: s.label })),
            ],
          },
          {
            id: "owner",
            label: "Owner",
            value: ownerFilter,
            onChange: setOwnerFilter,
            options: [
              { value: "all", label: "All owners" },
              ...owners.map((o) => ({ value: o, label: o })),
            ],
          },
        ]}
      />

      {showForm ? (
        <div className="surface-card mb-6 grid gap-3 p-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="label">Title</label>
            <input
              className="field"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Assign to</label>
            <ContactOwnerSelect
              value={form.owner}
              onChange={(owner) => setForm({ ...form, owner })}
            />
          </div>
          <div>
            <label className="label">From</label>
            <input
              className="field"
              type="date"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Deadline</label>
            <input
              className="field"
              type="date"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Category</label>
            <SearchSelect
              className="field"
              value={form.category}
              onChange={(category) => setForm({ ...form, category })}
              options={categoryOptions}
            />
          </div>
          <div>
            <label className="label">Status</label>
            <SearchSelect
              className="field"
              value={form.status}
              onChange={(status) =>
                setForm({ ...form, status: status as TaskStatus })
              }
              options={selectOptionsWithCurrent(statusOptions, form.status)}
            />
          </div>
          <div className="md:col-span-2">
            <TaskRelatedFields
              value={{
                related_type: form.related_type,
                related_id: form.related_id,
              }}
              onChange={(related) => setForm({ ...form, ...related })}
            />
          </div>
          <div className="md:col-span-2">
            <label className="label">Details</label>
            <RichTextEditor
              value={form.details}
              onChange={(details) => setForm({ ...form, details })}
              placeholder="Details…"
              minHeight="70px"
            />
          </div>
          <div className="md:col-span-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-primary"
              disabled={creating}
              onClick={() => void create()}
            >
              {creating ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={creating}
              onClick={() => {
                setShowForm(false);
                setFormError(null);
              }}
            >
              Cancel
            </button>
            {formError && !editingId ? (
              <p className="text-sm text-rose-700" role="alert">
                {formError}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {view === "list" ? (
        <ul className="surface-card divide-y divide-border">
          {filtered.map((item) => (
            <li key={item.id} className="flex flex-wrap items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{item.title}</p>
                  <StatusPill
                    status={item.status}
                    label={
                      statusColumns.find((s) => s.id === item.status)?.label ??
                      item.status
                    }
                  />
                  {isOverdue(item) ? (
                    <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-800">
                      Overdue
                    </span>
                  ) : null}
                  <TaskRelatedChip
                    related_type={item.related_type}
                    related_id={item.related_id}
                  />
                </div>
                <p className="mt-1 text-xs text-muted">
                  {[item.category, item.owner, formatTaskSchedule(item)]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {plainTextFromHtml(item.details) ? (
                  <RichTextView
                    html={item.details}
                    plain
                    clampLines={2}
                    className="mt-2 text-sm text-foreground/80"
                  />
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <SearchSelect
                  className="field !w-auto py-1.5 text-xs"
                  value={item.status}
                  onChange={(status) =>
                    void setStatus(item.id, status as TaskStatus)
                  }
                  aria-label="Change status"
                  options={selectOptionsWithCurrent(statusOptions, item.status)}
                />
                <ContactOwnerSelect
                  value={item.owner}
                  onChange={(owner) => void setOwner(item.id, owner)}
                  className="!w-auto min-w-[9rem] py-1.5 text-xs"
                  aria-label="Assign person"
                />
                <button
                  type="button"
                  className="btn-secondary px-2.5 py-1.5 text-xs"
                  onClick={() => {
                    setEditingId(item.id);
                    setEdit(toEditForm(item));
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn-ghost px-2.5 py-1.5 text-xs text-[var(--danger)]"
                  onClick={() => void remove(item.id)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
          {filtered.length === 0 ? (
            <li className="list-none">
              <EmptyState
                title="No tasks match"
                description="Try clearing filters or add a new task from the form above."
              />
            </li>
          ) : null}
        </ul>
      ) : null}

      {view === "kanban" ? (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {statusColumns.map((col) => {
            const colItems = filtered.filter((i) => i.status === col.id);
            const isDropTarget = dropTarget === col.id;
            return (
              <div
                key={col.id}
                className={cn(
                  "surface-card flex w-72 shrink-0 flex-col p-3 transition",
                  isDropTarget && "ring-2 ring-brand/40 bg-brand/5"
                )}
                onDragOver={(e) => onColumnDragOver(e, col.id)}
                onDragLeave={(e) => onColumnDragLeave(e, col.id)}
                onDrop={(e) => onColumnDrop(e, col.id)}
              >
                <div className="mb-3 flex items-center justify-between px-1">
                  <h2 className="text-sm font-semibold text-brand">
                    {col.label}
                  </h2>
                  <span className="text-xs text-muted">{colItems.length}</span>
                </div>
                <div className="flex min-h-[4.5rem] flex-1 flex-col gap-2">
                  {colItems.map((item) => (
                    <article
                      key={item.id}
                      draggable
                      onDragStart={(e) => onCardDragStart(e, item.id)}
                      onDragEnd={onCardDragEnd}
                      className={cn(
                        "cursor-grab rounded-xl border border-border bg-sand/60 p-3 active:cursor-grabbing",
                        draggingId === item.id && "opacity-50"
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-sm font-medium">{item.title}</p>
                        {isOverdue(item) ? (
                          <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-800">
                            Overdue
                          </span>
                        ) : null}
                        <TaskRelatedChip
                          related_type={item.related_type}
                          related_id={item.related_id}
                        />
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {[item.category, item.owner, formatTaskSchedule(item)]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {plainTextFromHtml(item.details) ? (
                        <RichTextView
                          html={item.details}
                          plain
                          clampLines={2}
                          className="mt-2 text-xs text-foreground/80"
                        />
                      ) : null}
                      <div className="mt-3 flex flex-col gap-2">
                        <SearchSelect
                          className="field w-full py-1.5 text-xs"
                          value={item.status}
                          onChange={(status) =>
                            void setStatus(
                              item.id,
                              status as TaskStatus
                            )
                          }
                          aria-label="Change status"
                          options={selectOptionsWithCurrent(
                            statusOptions,
                            item.status
                          )}
                        />
                        <ContactOwnerSelect
                          value={item.owner}
                          onChange={(owner) => void setOwner(item.id, owner)}
                          className="w-full py-1.5 text-xs"
                          aria-label="Assign person"
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="btn-secondary px-2.5 py-1.5 text-xs"
                            onClick={() => {
                              setEditingId(item.id);
                              setEdit(toEditForm(item));
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn-ghost px-2.5 py-1.5 text-xs text-[var(--danger)]"
                            onClick={() => void remove(item.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                  {colItems.length === 0 ? (
                    <p className="px-1 py-2 text-xs text-muted">
                      {isDropTarget ? "Drop here" : "No tasks"}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {view === "calendar" ? (
        <div className="hub-fc surface-card overflow-hidden p-3 md:p-4">
          <p className="mb-3 text-xs text-muted">
            Tasks with a From or Deadline date. Drag to reschedule, or click to
            edit.
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
            dayMaxEvents={4}
            moreLinkClick="popover"
            editable
            eventStartEditable
            eventDurationEditable={false}
            events={calendarEvents}
            eventClassNames="!border-0 !bg-transparent cursor-grab active:cursor-grabbing"
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
              const nextStart = info.event.startStr.slice(0, 10);
              if (!nextStart) {
                info.revert();
                return;
              }
              const hadRange = Boolean(item?.start_date && item?.due_date);
              if (hadRange && info.event.end) {
                const exclusiveEnd = info.event.endStr.slice(0, 10);
                const nextDue = format(
                  addDays(parseISO(exclusiveEnd), -1),
                  "yyyy-MM-dd"
                );
                void setTaskDates(id, nextStart, nextDue).catch(() =>
                  info.revert()
                );
                return;
              }
              if (item?.start_date && !item.due_date) {
                void setTaskDates(id, nextStart, null).catch(() =>
                  info.revert()
                );
                return;
              }
              void setTaskDates(
                id,
                item?.start_date ?? null,
                nextStart
              ).catch(() => info.revert());
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
              return (
                <div
                  className={cn(
                    "w-full truncate rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-tight",
                    statusTone(item.status),
                    isOverdue(item) && "ring-1 ring-rose-300"
                  )}
                  title={[item.title, item.owner, item.category]
                    .filter(Boolean)
                    .join(" · ")}
                >
                  {item.title}
                </div>
              );
            }}
          />
          {calendarEvents.length === 0 ? (
            <p className="mt-4 text-sm text-muted">
              No dated tasks yet — add a due date when creating or editing.
            </p>
          ) : null}
        </div>
      ) : null}

      {view === "timeline" ? (
        <TimelineChart
          items={timelineItems}
          onSelect={(id) => {
            const item = filtered.find((i) => i.id === id);
            if (item) openEdit(item);
          }}
          emptyMessage="No dated tasks in this filter. Add a From or Deadline date to see them on the timeline."
          footer={
            undatedCount > 0 ? (
              <p className="mt-4 text-xs text-muted">
                {undatedCount} task(s) have no From or Deadline and are hidden
                here — switch to Kanban or List to edit them.
              </p>
            ) : null
          }
        />
      ) : null}

      {edit && editingId ? (
        <RecordDrawer
          open
          onClose={() => {
            setEditingId(null);
            setEdit(null);
            setFormError(null);
          }}
          title="Edit task"
          ariaLabel="Edit task"
          footer={
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn-primary"
                disabled={saving}
                onClick={() => void saveEdit()}
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setEditingId(null);
                  setEdit(null);
                  setFormError(null);
                }}
              >
                Cancel
              </button>
              {formError && editingId ? (
                <p className="text-sm text-danger" role="alert">
                  {formError}
                </p>
              ) : null}
            </div>
          }
        >
          <div className="space-y-3">
            <div>
              <label className="label">Title</label>
              <input
                className="field"
                value={edit.title}
                onChange={(e) => setEdit({ ...edit, title: e.target.value })}
              />
            </div>
            <div>
              <label className="label">From</label>
              <input
                className="field"
                type="date"
                value={edit.start_date}
                onChange={(e) =>
                  setEdit({ ...edit, start_date: e.target.value })
                }
              />
            </div>
            <div>
              <label className="label">Deadline</label>
              <input
                className="field"
                type="date"
                value={edit.due_date}
                onChange={(e) =>
                  setEdit({ ...edit, due_date: e.target.value })
                }
              />
            </div>
            <div>
              <label className="label">Category</label>
              <SearchSelect
                className="field"
                value={edit.category}
                onChange={(category) => setEdit({ ...edit, category })}
                options={selectOptionsWithCurrent(categoryOptions, edit.category)}
              />
            </div>
            <div>
              <label className="label">Assign to</label>
              <ContactOwnerSelect
                value={edit.owner}
                onChange={(owner) => setEdit({ ...edit, owner })}
              />
            </div>
            <div>
              <label className="label">Status</label>
              <SearchSelect
                className="field"
                value={edit.status}
                onChange={(status) =>
                  setEdit({ ...edit, status: status as TaskStatus })
                }
                options={selectOptionsWithCurrent(statusOptions, edit.status)}
              />
            </div>
            <TaskRelatedFields
              value={{
                related_type: edit.related_type,
                related_id: edit.related_id,
              }}
              onChange={(related) => setEdit({ ...edit, ...related })}
            />
            <div>
              <label className="label">Details</label>
              <RichTextEditor
                value={edit.details}
                onChange={(details) => setEdit({ ...edit, details })}
                placeholder="Details…"
                minHeight="100px"
              />
            </div>
          </div>
        </RecordDrawer>
      ) : null}
    </div>
  );
}
