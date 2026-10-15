"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AssetUploadField } from "@/components/content/AssetUploadField";
import { ASSET_REQUEST_CATEGORIES } from "@/lib/data/collections";
import { parseAssetUrls } from "@/lib/data/normalize";
import type {
  StaffRequest,
  StaffRequestKind,
  StaffRequestStatus,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { RichTextView } from "@/components/ui/RichTextView";
import { plainTextFromHtml } from "@/lib/plain-text";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { ContactOwnerSelect } from "@/components/ui/ContactOwnerSelect";
import { removeById, rowFromResponse, upsertById } from "@/lib/data/list-patch";

const KINDS: { id: StaffRequestKind; label: string }[] = [
  { id: "asset", label: "Asset request" },
  { id: "social_form", label: "Social media form" },
  { id: "other", label: "Other" },
];

const STATUSES: { id: StaffRequestStatus; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "in_progress", label: "In progress" },
  { id: "done", label: "Done" },
];

const emptyForm = {
  kind: "asset" as StaffRequestKind,
  category: "",
  title: "",
  details: "",
  requested_by: "",
  needed_by: "",
  attachment_url: "",
};

function isAssetKind(kind: StaffRequestKind) {
  return kind === "asset";
}

function allowsUpload(kind: StaffRequestKind) {
  return kind === "asset" || kind === "social_form";
}

function AttachmentLinks({ raw }: { raw: string }) {
  const attachments = parseAssetUrls(raw);
  if (attachments.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
      {attachments.map((url, index) => (
        <a
          key={`${url}-${index}`}
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-brand underline-offset-2 hover:underline"
        >
          {attachments.length === 1
            ? "View attachment"
            : `View attachment ${index + 1}`}
        </a>
      ))}
    </div>
  );
}

export function StaffRequestsClient({
  initial,
  kind,
  startWithForm = false,
}: {
  initial: StaffRequest[];
  /** Lock list + new form to this request kind */
  kind?: StaffRequestKind;
  startWithForm?: boolean;
}) {
  const [items, setItems] = useState(initial);
  const [showForm, setShowForm] = useState(startWithForm);
  const [form, setForm] = useState({
    ...emptyForm,
    kind: kind ?? ("asset" as StaffRequestKind),
  });
  const [kindFilter, setKindFilter] = useState<string>(kind ?? "all");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/staff-requests");
    const data = await res.json();
    setItems(data.requests ?? []);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!kind) return;
    setKindFilter(kind);
    setForm((f) => ({ ...f, kind }));
  }, [kind]);

  const filtered = useMemo(() => {
    if (kindFilter === "all") return items;
    return items.filter((i) => i.kind === kindFilter);
  }, [items, kindFilter]);

  const activeKind = kind ?? form.kind;

  const title =
    kind === "asset"
      ? "Asset requests"
      : kind === "social_form"
        ? "Social media forms"
        : kind === "other"
          ? "Other requests"
          : "Asset & form requests";

  const blurb =
    kind === "asset"
      ? "Ask marketing for photos, logos, decks, or other assets."
      : kind === "social_form"
        ? "Request or track an internal social media intake form (staff wins, events, etc.)."
        : kind === "other"
          ? "Anything else the marketing team can help with."
          : "Internal asks for assets, social media intake forms, and other staff marketing support.";

  async function create() {
    const res = await fetch("/api/staff-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        kind: kind ?? form.kind,
        category: isAssetKind(kind ?? form.kind) ? form.category : "",
        attachment_url: form.attachment_url || "",
        needed_by: form.needed_by || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    const item = rowFromResponse<StaffRequest>(data);
    if (!res.ok || !item) return;
    setItems((prev) => upsertById(prev, item));
    setShowForm(false);
    setForm({ ...emptyForm, kind: kind ?? "asset" });
  }

  async function setStatus(id: string, status: StaffRequestStatus) {
    const res = await fetch("/api/staff-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", id, patch: { status } }),
    });
    const data = await res.json().catch(() => ({}));
    const item = rowFromResponse<StaffRequest>(data);
    if (!res.ok || !item) return;
    setItems((prev) => upsertById(prev, item));
  }

  async function remove(id: string) {
    const res = await fetch("/api/staff-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    if (!res.ok) return;
    setItems((prev) => removeById(prev, id));
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl text-brand">{title}</h2>
        <button
          type="button"
          className="btn-primary"
          onClick={() => setShowForm(true)}
        >
          New request
        </button>
      </div>

      <p className="mb-4 text-sm text-muted">{blurb}</p>

      {!kind ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm",
              kindFilter === "all"
                ? "border-brand bg-accent-soft text-brand"
                : "border-border text-muted"
            )}
            onClick={() => setKindFilter("all")}
          >
            All kinds
          </button>
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm",
                kindFilter === k.id
                  ? "border-brand bg-accent-soft text-brand"
                  : "border-border text-muted"
              )}
              onClick={() => setKindFilter(k.id)}
            >
              {k.label}
            </button>
          ))}
        </div>
      ) : null}

      {showForm ? (
        <div className="surface-card mb-6 grid gap-3 p-5 md:grid-cols-2">
          {!kind ? (
            <div>
              <label className="label">Kind</label>
              <SearchSelect
                className="field"
                value={form.kind}
                onChange={(kind) =>
                  setForm({
                    ...form,
                    kind: kind as StaffRequestKind,
                    category: kind === "asset" ? form.category : "",
                  })
                }
                options={KINDS.map((k) => ({ value: k.id, label: k.label }))}
              />
            </div>
          ) : null}
          <div className={!kind ? undefined : "md:col-span-2"}>
            <label className="label">Requested by</label>
            <ContactOwnerSelect
              className="field"
              aria-label="Requested by"
              value={form.requested_by}
              onChange={(requested_by) =>
                setForm({ ...form, requested_by })
              }
            />
          </div>
          {isAssetKind(activeKind) ? (
            <div className="md:col-span-2">
              <label className="label">Asset type</label>
              <SearchSelect
                className="field"
                value={form.category}
                allowEmpty
                emptyLabel="Select type…"
                placeholder="Select type…"
                onChange={(category) =>
                  setForm({ ...form, category })
                }
                options={ASSET_REQUEST_CATEGORIES}
              />
            </div>
          ) : null}
          <div className="md:col-span-2">
            <label className="label">Title</label>
            <input
              className="field"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={
                kind === "social_form" || activeKind === "social_form"
                  ? "e.g. Staff wins shout-out form"
                  : kind === "asset" || activeKind === "asset"
                    ? "e.g. High-res project photos for LinkedIn"
                    : "What do you need?"
              }
            />
          </div>
          <div className="md:col-span-2">
            <label className="label">Details</label>
            <RichTextEditor
              value={form.details}
              onChange={(details) => setForm({ ...form, details })}
              placeholder="Details…"
              minHeight="88px"
            />
          </div>
          {allowsUpload(activeKind) ? (
            <div className="md:col-span-2">
              <AssetUploadField
                multiple
                value={form.attachment_url}
                onChange={(url) =>
                  setForm({ ...form, attachment_url: url })
                }
                label={
                  activeKind === "social_form"
                    ? "Reference / draft media"
                    : "Reference files"
                }
                hint={
                  activeKind === "social_form"
                    ? "Optional images, PDF or short video for the social request · drop several at once · max 25MB each."
                    : "Optional brief, draft, or example files · drop several at once · max 25MB each."
                }
              />
            </div>
          ) : null}
          <div>
            <label className="label">Needed by</label>
            <input
              type="date"
              className="field"
              value={form.needed_by}
              onChange={(e) => setForm({ ...form, needed_by: e.target.value })}
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              type="button"
              className="btn-primary"
              onClick={() => void create()}
            >
              Submit
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <ul className="space-y-3">
        {filtered.map((item) => (
          <li key={item.id} className="surface-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {KINDS.find((k) => k.id === item.kind)?.label ?? item.kind}
                  {item.kind === "asset" && item.category
                    ? ` · ${item.category}`
                    : ""}
                </p>
                <p className="mt-1 font-medium">{item.title}</p>
                {plainTextFromHtml(item.details) ? (
                  <div className="mt-1 text-sm text-muted">
                    <RichTextView html={item.details} />
                  </div>
                ) : null}
                <AttachmentLinks raw={item.attachment_url} />
                <p className="mt-2 text-xs text-muted">
                  {item.requested_by || "Staff"}
                  {item.needed_by ? ` · needed ${item.needed_by}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <SearchSelect
                  className="field py-1.5 text-sm"
                  value={item.status}
                  onChange={(status) =>
                    void setStatus(
                      item.id,
                      status as StaffRequestStatus
                    )
                  }
                  options={STATUSES.map((s) => ({ value: s.id, label: s.label }))}
                />
                <button
                  type="button"
                  className="text-sm text-muted hover:text-red-600"
                  onClick={() => void remove(item.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          </li>
        ))}
        {filtered.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted">
            No requests yet.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
