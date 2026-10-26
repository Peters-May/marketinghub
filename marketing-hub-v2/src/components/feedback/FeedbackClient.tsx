"use client";

import { useState, useCallback } from "react";
import { Bug, Lightbulb, Sparkles, MessageSquare, Plus, ChevronDown, ChevronUp, Trash2, CheckCircle2, Circle, Clock, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type FeedbackItem = {
  id: string;
  created_at: string;
  submitted_by: string | null;
  submitted_by_name: string | null;
  type: "bug" | "improvement" | "idea" | "other";
  title: string;
  description: string | null;
  status: "open" | "in_progress" | "done" | "wont_fix";
  priority: "low" | "medium" | "high";
  admin_notes: string | null;
};

type Props = {
  initial: FeedbackItem[];
  isAdmin: boolean;
  currentUserId: string;
  currentUserName: string;
};

const TYPE_META = {
  bug: { label: "Bug", icon: Bug, color: "text-red-500", bg: "bg-red-50" },
  improvement: { label: "Improvement", icon: Lightbulb, color: "text-amber-500", bg: "bg-amber-50" },
  idea: { label: "Idea", icon: Sparkles, color: "text-purple-500", bg: "bg-purple-50" },
  other: { label: "Other", icon: MessageSquare, color: "text-muted", bg: "bg-sand" },
};

const STATUS_META = {
  open: { label: "Open", icon: Circle, color: "text-muted", badge: "bg-sand text-foreground" },
  in_progress: { label: "In Progress", icon: Clock, color: "text-amber-500", badge: "bg-amber-50 text-amber-700" },
  done: { label: "Done", icon: CheckCircle2, color: "text-green-500", badge: "bg-green-50 text-green-700" },
  wont_fix: { label: "Won't Fix", icon: XCircle, color: "text-muted", badge: "bg-border/60 text-muted" },
};

const PRIORITY_BADGE = {
  high: "bg-red-50 text-red-600",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-sand text-muted",
};

const emptyForm = { type: "bug" as FeedbackItem["type"], title: "", description: "", priority: "medium" as FeedbackItem["priority"] };

export function FeedbackClient({ initial, isAdmin, currentUserId, currentUserName }: Props) {
  const [items, setItems] = useState<FeedbackItem[]>(initial);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [adminNoteEdits, setAdminNoteEdits] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editSaving, setEditSaving] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/feedback");
    if (res.ok) setItems(await res.json());
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSubmitting(true);
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, submitted_by_name: currentUserName }),
    });
    setForm(emptyForm);
    setShowForm(false);
    setSubmitting(false);
    await refresh();
  }

  async function updateStatus(id: string, status: FeedbackItem["status"]) {
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", id, patch: { status } }),
    });
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
  }

  async function updatePriority(id: string, priority: FeedbackItem["priority"]) {
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", id, patch: { priority } }),
    });
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, priority } : i)));
  }

  async function saveAdminNote(id: string) {
    const admin_notes = adminNoteEdits[id] ?? "";
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", id, patch: { admin_notes } }),
    });
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, admin_notes } : i)));
  }

  async function deleteItem(id: string) {
    if (!confirm("Delete this feedback item?")) return;
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  async function saveOwnEdit(id: string) {
    if (!editForm.title.trim()) return;
    setEditSaving(true);
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update",
        id,
        patch: {
          type: editForm.type,
          title: editForm.title.trim(),
          description: editForm.description,
          priority: editForm.priority,
        },
      }),
    });
    setEditSaving(false);
    if (!res.ok) return;
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              type: editForm.type,
              title: editForm.title.trim(),
              description: editForm.description.trim() || null,
              priority: editForm.priority,
            }
          : item
      )
    );
    setEditingId(null);
  }

  function canEditOwn(item: FeedbackItem) {
    return !isAdmin && Boolean(currentUserId) && item.submitted_by === currentUserId;
  }

  function canDeleteItem(item: FeedbackItem) {
    return isAdmin || (currentUserId && item.submitted_by === currentUserId);
  }

  const filtered = items.filter((i) => {
    if (filterType !== "all" && i.type !== filterType) return false;
    if (filterStatus !== "all" && i.status !== filterStatus) return false;
    return true;
  });

  const counts = {
    open: items.filter((i) => i.status === "open").length,
    in_progress: items.filter((i) => i.status === "in_progress").length,
    done: items.filter((i) => i.status === "done").length,
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-foreground">Feedback</h1>
          <p className="text-sm text-muted mt-1">
            Report bugs, suggest improvements, or share ideas for the Hub.
          </p>
          <p className="text-xs text-muted mt-2">
            Your feedback is only visible to you and the marketing team.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="btn-primary flex items-center gap-2 shrink-0"
        >
          <Plus className="h-4 w-4" />
          Add feedback
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {(["open", "in_progress", "done"] as const).map((s) => {
          const meta = STATUS_META[s];
          const Icon = meta.icon;
          return (
            <button
              key={s}
              onClick={() => setFilterStatus(filterStatus === s ? "all" : s)}
              className={cn(
                "surface-card p-4 text-left transition hover:shadow-md",
                filterStatus === s && "ring-2 ring-brand"
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className={cn("h-4 w-4", meta.color)} />
                <span className="text-xs text-muted">{meta.label}</span>
              </div>
              <span className="text-2xl font-semibold text-foreground">{counts[s]}</span>
            </button>
          );
        })}
      </div>

      {/* Submit form */}
      {showForm && (
        <form onSubmit={submit} className="surface-card p-5 flex flex-col gap-4">
          <h2 className="font-semibold text-foreground">New feedback</h2>
          <p className="text-xs text-muted -mt-2">
            Only you and marketing can see what you submit here.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="label">Type</label>
              <select
                className="field"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as FeedbackItem["type"] }))}
              >
                {Object.entries(TYPE_META).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="label">Priority</label>
              <select
                className="field"
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as FeedbackItem["priority"] }))}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="label">Title *</label>
            <input
              className="field"
              placeholder="Short summary…"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="label">Description</label>
            <textarea
              className="field min-h-[100px] resize-y"
              placeholder="Steps to reproduce, context, or detail…"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn-secondary" onClick={() => { setShowForm(false); setForm(emptyForm); }}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit"}
            </button>
          </div>
        </form>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-muted">Filter:</span>
        <div className="flex gap-1 flex-wrap">
          {(["all", "bug", "improvement", "idea", "other"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t === "all" ? "all" : t)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition",
                filterType === t
                  ? "bg-brand text-white"
                  : "bg-sand text-muted hover:bg-border"
              )}
            >
              {t === "all" ? "All types" : TYPE_META[t].label}
            </button>
          ))}
        </div>
        {filterStatus !== "all" && (
          <button
            onClick={() => setFilterStatus("all")}
            className="px-3 py-1 rounded-full text-xs font-medium bg-brand/10 text-brand hover:bg-brand/20 transition"
          >
            × {STATUS_META[filterStatus as keyof typeof STATUS_META]?.label}
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex flex-col gap-3">
        {filtered.length === 0 && (
          <div className="surface-card p-10 text-center text-muted text-sm">
            {isAdmin
              ? "No feedback matches your filters."
              : "You haven't submitted any feedback yet."}
          </div>
        )}
        {filtered.map((item) => {
          const typeMeta = TYPE_META[item.type];
          const statusMeta = STATUS_META[item.status];
          const TypeIcon = typeMeta.icon;
          const StatusIcon = statusMeta.icon;
          const expanded = expandedId === item.id;

          return (
            <div key={item.id} className="surface-card overflow-hidden">
              <div
                className="flex items-start gap-3 p-4 cursor-pointer hover:bg-sand/40 transition"
                onClick={() => setExpandedId(expanded ? null : item.id)}
              >
                {/* Type icon */}
                <div className={cn("mt-0.5 p-1.5 rounded-lg shrink-0", typeMeta.bg)}>
                  <TypeIcon className={cn("h-4 w-4", typeMeta.color)} />
                </div>

                {/* Main content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-foreground truncate">{item.title}</span>
                    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", PRIORITY_BADGE[item.priority])}>
                      {item.priority}
                    </span>
                    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1", statusMeta.badge)}>
                      <StatusIcon className="h-3 w-3" />
                      {statusMeta.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted">
                    <span>{item.submitted_by_name ?? "Anonymous"}</span>
                    <span>·</span>
                    <span>{new Date(item.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                  </div>
                </div>

                <div className="shrink-0 text-muted">
                  {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </div>

              {/* Expanded */}
              {expanded && (
                <div className="border-t border-border px-4 pb-4 pt-3 flex flex-col gap-4">
                  {item.description && editingId !== item.id && (
                    <p className="text-sm text-foreground/80 whitespace-pre-wrap">{item.description}</p>
                  )}

                  {!isAdmin && canEditOwn(item) ? (
                    editingId === item.id ? (
                      <form
                        className="flex flex-col gap-3"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void saveOwnEdit(item.id);
                        }}
                      >
                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex flex-col gap-1">
                            <label className="label">Type</label>
                            <select
                              className="field"
                              value={editForm.type}
                              onChange={(event) =>
                                setEditForm((current) => ({
                                  ...current,
                                  type: event.target.value as FeedbackItem["type"],
                                }))
                              }
                            >
                              {Object.entries(TYPE_META).map(([key, meta]) => (
                                <option key={key} value={key}>
                                  {meta.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="label">Priority</label>
                            <select
                              className="field"
                              value={editForm.priority}
                              onChange={(event) =>
                                setEditForm((current) => ({
                                  ...current,
                                  priority: event.target.value as FeedbackItem["priority"],
                                }))
                              }
                            >
                              <option value="low">Low</option>
                              <option value="medium">Medium</option>
                              <option value="high">High</option>
                            </select>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="label">Title</label>
                          <input
                            className="field"
                            value={editForm.title}
                            required
                            onChange={(event) =>
                              setEditForm((current) => ({
                                ...current,
                                title: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="label">Description</label>
                          <textarea
                            className="field min-h-[100px] resize-y"
                            value={editForm.description}
                            onChange={(event) =>
                              setEditForm((current) => ({
                                ...current,
                                description: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button type="submit" className="btn-primary" disabled={editSaving}>
                            {editSaving ? "Saving…" : "Save"}
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteItem(item.id)}
                            className="ml-auto btn-ghost text-red-500 hover:text-red-600 flex items-center gap-1 text-xs"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="btn-secondary text-xs"
                          onClick={() => {
                            setEditingId(item.id);
                            setEditForm({
                              type: item.type,
                              title: item.title,
                              description: item.description ?? "",
                              priority: item.priority,
                            });
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteItem(item.id)}
                          className="btn-ghost text-red-500 hover:text-red-600 flex items-center gap-1 text-xs"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </div>
                    )
                  ) : null}

                  {isAdmin && (
                    <div className="flex flex-wrap gap-3 items-center">
                      <div className="flex items-center gap-2">
                        <label className="label">Status</label>
                        <select
                          className="field py-1 text-xs"
                          value={item.status}
                          onChange={(e) => updateStatus(item.id, e.target.value as FeedbackItem["status"])}
                        >
                          {Object.entries(STATUS_META).map(([k, v]) => (
                            <option key={k} value={k}>{v.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="label">Priority</label>
                        <select
                          className="field py-1 text-xs"
                          value={item.priority}
                          onChange={(e) => updatePriority(item.id, e.target.value as FeedbackItem["priority"])}
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </div>
                      {canDeleteItem(item) ? (
                        <button
                          onClick={() => deleteItem(item.id)}
                          className="ml-auto btn-ghost text-red-500 hover:text-red-600 flex items-center gap-1 text-xs"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      ) : null}
                    </div>
                  )}

                  {isAdmin && (
                    <div className="flex flex-col gap-1.5">
                      <label className="label">Admin notes</label>
                      <textarea
                        className="field text-sm min-h-[72px] resize-y"
                        placeholder="Internal notes on this item…"
                        value={adminNoteEdits[item.id] ?? item.admin_notes ?? ""}
                        onChange={(e) => setAdminNoteEdits((n) => ({ ...n, [item.id]: e.target.value }))}
                      />
                      <button
                        className="btn-secondary text-xs self-end"
                        onClick={() => saveAdminNote(item.id)}
                      >
                        Save note
                      </button>
                    </div>
                  )}

                  {item.admin_notes && !isAdmin && (
                    <div className="bg-accent-soft rounded-lg p-3 text-sm text-foreground/80">
                      <span className="font-medium text-brand text-xs uppercase tracking-wide block mb-1">Update</span>
                      {item.admin_notes}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
