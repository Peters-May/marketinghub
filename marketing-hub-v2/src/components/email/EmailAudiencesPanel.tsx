"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { MediaList } from "@/lib/types";
import type { AudienceWithCount } from "@/components/email/EmailMarketingHub";
import { EmptyState } from "@/components/ui/PageHeader";
import { RecordDrawer } from "@/components/ui/RecordDrawer";
import { cn } from "@/lib/utils";

type FormState = {
  name: string;
  description: string;
  list_ids: string[];
  country: string;
  tags: string;
  exclude_unsubscribed: boolean;
};

function emptyForm(): FormState {
  return {
    name: "",
    description: "",
    list_ids: [],
    country: "",
    tags: "",
    exclude_unsubscribed: true,
  };
}

function toForm(a: AudienceWithCount): FormState {
  return {
    name: a.name,
    description: a.description,
    list_ids: a.list_ids ?? [],
    country: a.filter?.country ?? "",
    tags: (a.filter?.tags ?? []).join(", "),
    exclude_unsubscribed: a.exclude_unsubscribed !== false,
  };
}

export function EmailAudiencesPanel({
  audiences,
  setAudiences,
  lists,
}: {
  audiences: AudienceWithCount[];
  setAudiences: React.Dispatch<React.SetStateAction<AudienceWithCount[]>>;
  lists: MediaList[];
}) {
  const [selected, setSelected] = useState<AudienceWithCount | null>(null);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggleList(id: string) {
    setForm((f) => ({
      ...f,
      list_ids: f.list_ids.includes(id)
        ? f.list_ids.filter((x) => x !== id)
        : [...f.list_ids, id],
    }));
  }

  async function save() {
    setSaving(true);
    setError("");
    const patch = {
      name: form.name || "Untitled audience",
      description: form.description,
      list_ids: form.list_ids,
      contact_ids: selected?.contact_ids ?? [],
      filter: {
        tags: form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        country: form.country.trim(),
      },
      exclude_unsubscribed: form.exclude_unsubscribed,
    };
    try {
      if (creating) {
        const res = await fetch("/api/email/audiences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Create failed");
        setAudiences((prev) => [...prev, data.item].sort((a, b) => a.name.localeCompare(b.name)));
        setSelected(data.item);
        setCreating(false);
        setForm(toForm(data.item));
      } else if (selected) {
        const res = await fetch("/api/email/audiences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update",
            id: selected.id,
            patch,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Update failed");
        setAudiences((prev) =>
          prev.map((a) => (a.id === data.item.id ? data.item : a))
        );
        setSelected(data.item);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this audience?")) return;
    await fetch("/api/email/audiences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    setAudiences((prev) => prev.filter((a) => a.id !== id));
    setOpen(false);
    setSelected(null);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-sm text-muted">
          Built from marketing lists. Only contacts with marketing consent are
          counted and sent.
        </p>
        <button
          type="button"
          className="btn-primary inline-flex items-center gap-1.5"
          onClick={() => {
            setCreating(true);
            setSelected(null);
            setForm(emptyForm());
            setOpen(true);
            setError("");
          }}
        >
          <Plus className="h-4 w-4" />
          New audience
        </button>
      </div>

      {audiences.length === 0 ? (
        <EmptyState
          title="No audiences"
          description="Link one or more marketing lists, optionally filter by country or tags."
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-white">
          {audiences.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50",
                  selected?.id === a.id && "bg-slate-50"
                )}
                onClick={() => {
                  setSelected(a);
                  setCreating(false);
                  setForm(toForm(a));
                  setOpen(true);
                  setError("");
                }}
              >
                <div>
                  <div className="font-medium text-brand">{a.name}</div>
                  <div className="mt-0.5 text-xs text-muted">
                    {a.description || "No description"}
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
                  {a.recipient_count ?? 0} ready
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <RecordDrawer
        open={open}
        onClose={() => {
          setOpen(false);
          setCreating(false);
        }}
        title={creating ? "New audience" : selected?.name || "Audience"}
      >
        <div className="space-y-4">
          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          <label className="block text-sm">
            <span className="text-muted">Name</span>
            <input
              className="input mt-1 w-full"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>

          <label className="block text-sm">
            <span className="text-muted">Description</span>
            <textarea
              className="input mt-1 min-h-[60px] w-full"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </label>

          <fieldset>
            <legend className="text-sm text-muted">Marketing lists</legend>
            <div className="mt-2 space-y-1">
              {lists.length === 0 ? (
                <p className="text-xs text-muted">
                  No marketing lists yet — create one under Data or PR lists.
                </p>
              ) : (
                lists.map((l) => (
                  <label
                    key={l.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={form.list_ids.includes(l.id)}
                      onChange={() => toggleList(l.id)}
                    />
                    {l.name}
                    <span className="text-xs text-muted">
                      ({l.contact_ids?.length ?? 0} contacts)
                    </span>
                  </label>
                ))
              )}
            </div>
          </fieldset>

          <label className="block text-sm">
            <span className="text-muted">Country filter (optional)</span>
            <input
              className="input mt-1 w-full"
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
              placeholder="e.g. United Kingdom"
            />
          </label>

          <label className="block text-sm">
            <span className="text-muted">Tags filter (comma-separated)</span>
            <input
              className="input mt-1 w-full"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="newsletter, yacht"
            />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.exclude_unsubscribed}
              onChange={(e) =>
                setForm({ ...form, exclude_unsubscribed: e.target.checked })
              }
            />
            Exclude suppressed / unsubscribed emails
          </label>

          {!creating && selected ? (
            <p className="text-xs text-muted">
              Consented recipients ready to send:{" "}
              <strong>{selected.recipient_count ?? 0}</strong>
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <button
              type="button"
              className="btn-primary"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {!creating && selected ? (
              <button
                type="button"
                className="btn-secondary text-red-700"
                onClick={() => void remove(selected.id)}
              >
                Delete
              </button>
            ) : null}
          </div>
        </div>
      </RecordDrawer>
    </div>
  );
}
