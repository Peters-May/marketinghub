"use client";

import { useCallback, useEffect, useId, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import type { HubTask, TaskRelatedType } from "@/lib/types";
import { useHubView } from "@/lib/hub-view";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/ui/StatusPill";
import { ContactOwnerSelect } from "@/components/ui/ContactOwnerSelect";

const LINKED_TO: Record<TaskRelatedType, string> = {
  content: "this post",
  theme: "this theme",
  sponsorship: "this partner",
  award: "this award",
  event: "this event",
  asset: "this asset",
};

/**
 * Reverse lookup: tasks that link to this content / theme / partner / award / event / asset.
 * Admin-only — members do not see Tasks.
 */
export function RelatedTasksPanel({
  relatedType,
  relatedId,
  suggestedTitle,
  className,
}: {
  relatedType: TaskRelatedType;
  relatedId: string | null | undefined;
  /** Prefills the new-task title, usually the open record title. */
  suggestedTitle?: string;
  className?: string;
}) {
  const { view } = useHubView();
  const titleId = useId();
  const deadlineId = useId();
  const [tasks, setTasks] = useState<HubTask[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [owner, setOwner] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!relatedId) {
      setTasks([]);
      setLoaded(true);
      return;
    }
    try {
      const qs = new URLSearchParams({
        related_type: relatedType,
        related_id: relatedId,
      });
      const res = await fetch(`/api/tasks?${qs.toString()}`);
      if (!res.ok) return;
      const data = (await res.json()) as { tasks?: HubTask[] };
      setTasks(data.tasks ?? []);
    } catch {
      /* keep previous */
    } finally {
      setLoaded(true);
    }
  }, [relatedType, relatedId]);

  useEffect(() => {
    if (view !== "admin") return;
    setLoaded(false);
    void refresh();
  }, [refresh, view]);

  const openAdd = () => {
    setTitle(suggestedTitle?.trim() ?? "");
    setDueDate("");
    setOwner("");
    setError(null);
    setAdding(true);
  };

  const cancelAdd = () => {
    setAdding(false);
    setError(null);
  };

  const create = async () => {
    if (!relatedId || saving) return;
    const nextTitle = title.trim();
    if (!nextTitle) {
      setError("Add a title");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: nextTitle,
          details: "",
          due_date: dueDate || null,
          owner,
          status: "todo",
          category: "",
          related_type: relatedType,
          related_id: relatedId,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        item?: HubTask;
      };
      if (!res.ok) {
        setError(
          typeof data.error === "string" ? data.error : "Could not save task"
        );
        return;
      }
      if (data.item) {
        setTasks((prev) =>
          prev.some((task) => task.id === data.item!.id)
            ? prev
            : [...prev, data.item!]
        );
      }
      setAdding(false);
      await refresh();
    } catch {
      setError("Could not save task");
    } finally {
      setSaving(false);
    }
  };

  if (view !== "admin" || !relatedId) return null;

  const linkedPhrase = LINKED_TO[relatedType] ?? "this record";

  return (
    <section
      className={cn(
        "rounded-xl border border-border bg-sand/40 p-3",
        className
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Related tasks
        </h3>
        <div className="flex items-center gap-3">
          {!adding ? (
            <button
              type="button"
              className="text-[11px] font-medium text-brand hover:underline"
              onClick={openAdd}
            >
              Add task
            </button>
          ) : null}
          <Link
            href="/app/tasks"
            className="text-[11px] font-medium text-brand hover:underline"
          >
            Open tasks
          </Link>
        </div>
      </div>

      {adding ? (
        <div className="mb-2 space-y-2 rounded-lg border border-border bg-white p-3">
          <div>
            <label className="label" htmlFor={titleId}>
              Title
            </label>
            <input
              id={titleId}
              className="field"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs doing?"
              autoFocus
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor={deadlineId}>
                Deadline
              </label>
              <input
                id={deadlineId}
                className="field"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Assign to</label>
              <ContactOwnerSelect value={owner} onChange={setOwner} />
            </div>
          </div>
          <p className="text-[11px] text-muted">
            Linked to {linkedPhrase}.
          </p>
          {error ? (
            <p className="text-xs text-rose-700" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-primary px-3 py-1.5 text-xs"
              disabled={saving}
              onClick={() => void create()}
            >
              {saving ? "Saving…" : "Save task"}
            </button>
            <button
              type="button"
              className="btn-secondary px-3 py-1.5 text-xs"
              disabled={saving}
              onClick={cancelAdd}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {!loaded ? (
        <p className="text-xs text-muted">Loading…</p>
      ) : tasks.length === 0 && !adding ? (
        <p className="text-xs text-muted">No tasks linked here yet.</p>
      ) : tasks.length > 0 ? (
        <ul className="space-y-2">
          {tasks.map((task) => (
            <li key={task.id}>
              <Link
                href="/app/tasks"
                className="block rounded-lg border border-border bg-white px-3 py-2 transition hover:border-brand/30"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-sm font-medium text-foreground">
                    {task.title}
                  </p>
                  <StatusPill status={task.status} />
                </div>
                <p className="mt-0.5 text-[11px] text-muted">
                  {[
                    task.owner,
                    (() => {
                      const from = task.start_date
                        ? format(parseISO(task.start_date), "d MMM yyyy")
                        : null;
                      const deadline = task.due_date
                        ? format(parseISO(task.due_date), "d MMM yyyy")
                        : null;
                      if (from && deadline) return `${from} → ${deadline}`;
                      if (deadline) return `Deadline ${deadline}`;
                      if (from) return `From ${from}`;
                      return null;
                    })(),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
