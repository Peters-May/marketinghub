"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  FileText,
  ImageIcon,
  Newspaper,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import type { Advertisement, AdvertisementStatus } from "@/lib/types";
import {
  ADVERTISEMENT_STATUS,
  optionsForField,
  type FieldOption,
} from "@/lib/data/collections";
import { useManagedFieldOptions } from "@/lib/data/useManagedFieldOptions";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { cn } from "@/lib/utils";
import { useHubView } from "@/lib/hub-view";
import { RecordDrawer } from "@/components/ui/RecordDrawer";
import { removeById, rowFromResponse, upsertById } from "@/lib/data/list-patch";

function emptyForm(): Omit<Advertisement, "id" | "created_at" | "updated_at"> {
  return {
    title: "",
    publication: "",
    status: "planned",
    starts_at: null,
    ends_at: null,
    artwork_url: "",
    agreement_url: "",
    notes: "",
  };
}

function statusLabel(status: AdvertisementStatus, options: FieldOption[]) {
  return options.find((o) => o.value === status)?.label ?? status;
}

function statusClass(status: AdvertisementStatus) {
  if (status === "active") return "bg-emerald-50 text-emerald-800";
  if (status === "planned") return "bg-sky-50 text-sky-800";
  if (status === "cancelled") return "bg-rose-50 text-rose-800";
  return "bg-slate-100 text-slate-700";
}

function formatDate(value: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function dateRange(item: Advertisement) {
  const start = formatDate(item.starts_at);
  const end = formatDate(item.ends_at);
  if (start && end) return `${start} – ${end}`;
  if (start) return `From ${start}`;
  if (end) return `Until ${end}`;
  return "Dates TBC";
}

function looksLikeImage(url: string) {
  return /\.(png|jpe?g|gif|webp|svg|avif)(\?|$)/i.test(url);
}

export function AdvertisementsPanel({
  initial,
  fieldOptions: fieldOptionsProp,
}: {
  initial: Advertisement[];
  fieldOptions?: Record<string, FieldOption[]>;
}) {
  const { canToggleAdminView } = useHubView();
  const fieldOptions = useManagedFieldOptions(
    "advertisements",
    fieldOptionsProp
  );
  const statusOptions = optionsForField(
    fieldOptions,
    "status",
    ADVERTISEMENT_STATUS
  );

  const [items, setItems] = useState(initial);
  const [statusFilter, setStatusFilter] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/advertisements");
    const data = await res.json();
    setItems(data.advertisements ?? []);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return items;
    return items.filter((item) => item.status === statusFilter);
  }, [items, statusFilter]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setDrawerOpen(true);
  }

  function openEdit(item: Advertisement) {
    setEditingId(item.id);
    setForm({
      title: item.title,
      publication: item.publication,
      status: item.status,
      starts_at: item.starts_at,
      ends_at: item.ends_at,
      artwork_url: item.artwork_url,
      agreement_url: item.agreement_url,
      notes: item.notes,
    });
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingId(null);
  }

  async function save() {
    const payload = { ...form };
    const res = await fetch("/api/advertisements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        editingId
          ? { action: "update", id: editingId, patch: payload }
          : payload
      ),
    });
    const data = await res.json().catch(() => ({}));
    const item = rowFromResponse<Advertisement>(data);
    if (!res.ok || !item) return;
    setItems((prev) => upsertById(prev, item));
    closeDrawer();
  }

  async function remove(id: string) {
    if (!canToggleAdminView) return;
    if (!window.confirm("Delete this advertisement?")) return;
    const res = await fetch("/api/advertisements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    if (!res.ok) return;
    setItems((prev) => removeById(prev, id));
    if (editingId === id) closeDrawer();
  }

  return (
    <section className="mb-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-brand">Advertisements</h2>
          <p className="mt-1 text-sm text-muted">
            Current print and placement ads — artwork, agreement, and run dates
            (for example Seahorse Magazine). Digital paid performance is below.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Add advertisement
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[{ value: "all", label: "All" }, ...statusOptions].map((option) => (
          <button
            key={option.value}
            type="button"
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition",
              statusFilter === option.value
                ? "bg-brand text-white"
                : "bg-sand text-muted hover:text-foreground"
            )}
            onClick={() => setStatusFilter(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="surface-card px-4 py-8 text-center text-sm text-muted">
          No advertisements yet. Add a placement with artwork, agreement, and
          dates.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((item) => (
            <article key={item.id} className="surface-card overflow-hidden">
              {item.artwork_url && looksLikeImage(item.artwork_url) ? (
                <div className="relative aspect-[16/9] bg-sand">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.artwork_url}
                    alt={`${item.title} artwork`}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div className="flex aspect-[16/9] items-center justify-center bg-sand text-muted">
                  <Newspaper className="h-8 w-8" />
                </div>
              )}
              <div className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium text-foreground">{item.title}</h3>
                    <p className="text-sm text-muted">
                      {item.publication || "Publication TBC"}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                      statusClass(item.status)
                    )}
                  >
                    {statusLabel(item.status, statusOptions)}
                  </span>
                </div>
                <p className="text-sm text-muted">{dateRange(item)}</p>
                {item.notes ? (
                  <p className="line-clamp-3 text-sm text-muted">{item.notes}</p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {item.artwork_url ? (
                    <a
                      href={item.artwork_url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary px-2.5 py-1.5 text-xs"
                    >
                      <ImageIcon className="h-3.5 w-3.5" />
                      Artwork
                    </a>
                  ) : null}
                  {item.agreement_url ? (
                    <a
                      href={item.agreement_url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary px-2.5 py-1.5 text-xs"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Agreement
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className="btn-ghost px-2.5 py-1.5 text-xs"
                    onClick={() => openEdit(item)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {drawerOpen ? (
        <RecordDrawer
          open
          onClose={closeDrawer}
          title={editingId ? "Edit advertisement" : "Add advertisement"}
          className="max-w-xl"
          footer={
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary"
                onClick={() => void save()}
              >
                Save
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={closeDrawer}
              >
                Cancel
              </button>
              {editingId && canToggleAdminView ? (
                <button
                  type="button"
                  className="btn-ghost ml-auto text-[var(--danger)]"
                  onClick={() => void remove(editingId)}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              ) : null}
            </div>
          }
        >
            <div className="space-y-4">
              <div>
                <label className="label">Title</label>
                <input
                  className="field"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Seahorse Magazine — display ad"
                />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="label">Publication</label>
                  <input
                    className="field"
                    value={form.publication}
                    onChange={(e) =>
                      setForm({ ...form, publication: e.target.value })
                    }
                    placeholder="Seahorse Magazine"
                  />
                </div>
                <div>
                  <label className="label">Status</label>
                  <SearchSelect
                    className="field"
                    value={form.status}
                    onChange={(status) =>
                      setForm({
                        ...form,
                        status: status as AdvertisementStatus,
                      })
                    }
                    options={statusOptions}
                  />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="label">Start date</label>
                  <input
                    className="field"
                    type="date"
                    value={form.starts_at ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        starts_at: e.target.value || null,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="label">End date</label>
                  <input
                    className="field"
                    type="date"
                    value={form.ends_at ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        ends_at: e.target.value || null,
                      })
                    }
                  />
                </div>
              </div>
              <div>
                <label className="label">Artwork URL</label>
                <input
                  className="field"
                  value={form.artwork_url}
                  onChange={(e) =>
                    setForm({ ...form, artwork_url: e.target.value })
                  }
                  placeholder="https://… or OneDrive / Canva link"
                />
              </div>
              <div>
                <label className="label">Agreement URL</label>
                <input
                  className="field"
                  value={form.agreement_url}
                  onChange={(e) =>
                    setForm({ ...form, agreement_url: e.target.value })
                  }
                  placeholder="https://… insertion order / contract"
                />
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea
                  className="field min-h-[88px]"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
        </RecordDrawer>
      ) : null}
    </section>
  );
}
