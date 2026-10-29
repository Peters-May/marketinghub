"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, ExternalLink } from "lucide-react";
import type { Advertisement, PaidCampaign, ReportLink } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormAlert } from "@/components/ui/FormAlert";
import { apiErrorMessage } from "@/lib/ui/form-feedback";
import {
  REPORT_CATEGORIES,
  REPORT_TOOLS,
  optionsForField,
  type FieldOption,
} from "@/lib/data/collections";
import { useManagedFieldOptions } from "@/lib/data/useManagedFieldOptions";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { RichTextView } from "@/components/ui/RichTextView";
import { plainTextFromHtml } from "@/lib/plain-text";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { PaidMediaPanel } from "@/components/reports/PaidMediaPanel";
import { AdvertisementsPanel } from "@/components/reports/AdvertisementsPanel";
import { removeById, rowFromResponse, upsertById } from "@/lib/data/list-patch";

export function ReportsClient({
  initial,
  paidCampaigns: initialPaidCampaigns,
  advertisements: initialAdvertisements,
  fieldOptions: fieldOptionsProp,
  paidFieldOptions: paidFieldOptionsProp,
  adFieldOptions: adFieldOptionsProp,
}: {
  initial: ReportLink[];
  paidCampaigns: PaidCampaign[];
  advertisements: Advertisement[];
  fieldOptions?: Record<string, FieldOption[]>;
  paidFieldOptions?: Record<string, FieldOption[]>;
  adFieldOptions?: Record<string, FieldOption[]>;
}) {
  const fieldOptions = useManagedFieldOptions("reports", fieldOptionsProp);
  const categoryOptions = optionsForField(
    fieldOptions,
    "category",
    REPORT_CATEGORIES
  );
  const toolOptions = optionsForField(fieldOptions, "tool", REPORT_TOOLS);
  const categoryOrder = categoryOptions.map((c) => c.value);

  const [items, setItems] = useState(initial);
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const [form, setForm] = useState({
    title: "",
    description: "",
    url: "",
    category: "Dashboards",
    tool: "Google Analytics",
  });

  const byCategory = useMemo(() => {
    const map = items.reduce<Record<string, ReportLink[]>>((acc, item) => {
      const key = item.category || "Dashboards";
      (acc[key] ??= []).push(item);
      return acc;
    }, {});
    const keys = [
      ...categoryOrder.filter((c) => map[c]?.length),
      ...Object.keys(map).filter((k) => !categoryOrder.includes(k)),
    ];
    return keys.map((k) => [k, map[k]] as const);
  }, [items, categoryOrder]);

  async function create() {
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    const item = rowFromResponse<ReportLink>(data);
    if (!res.ok || !item) {
      setFormError(apiErrorMessage(data, "Could not save report"));
      return;
    }
    setItems((prev) => upsertById(prev, item));
    setShowForm(false);
    setForm({
      title: "",
      description: "",
      url: "",
      category: "Dashboards",
      tool: "Google Analytics",
    });
  }

  async function saveUrl(id: string) {
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update",
        id,
        patch: { url: editUrl },
      }),
    });
    const data = await res.json().catch(() => ({}));
    const item = rowFromResponse<ReportLink>(data);
    if (!res.ok || !item) {
      setFormError(apiErrorMessage(data, "Could not save report"));
      return;
    }
    setItems((prev) => upsertById(prev, item));
    setEditingId(null);
    setEditUrl("");
  }

  async function remove(id: string) {
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFormError(apiErrorMessage(data, "Could not delete report"));
      return;
    }
    setItems((prev) => removeById(prev, id));
  }

  return (
    <div>
      <FormAlert message={formError} />
      <PageHeader
        title="Reporting"
        description="One place to open the tools you already use — Analytics, Ads, SE Ranking, Looker Studio. Print advertisements and paid-media snapshots sit below. Web enquiries live in the hub."
        actions={
          <button type="button" className="btn-primary" onClick={() => setShowForm(true)}>
            Add report link
          </button>
        }
      />

      <div className="surface-card mb-6 p-5 text-sm text-muted">
        <p className="font-medium text-foreground">Suggested stack</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <strong>Google Analytics</strong> — website traffic & behaviour
          </li>
          <li>
            <strong>Google Ads</strong> — paid campaign performance
          </li>
          <li>
            <strong>SE Ranking</strong> — SEO rankings & visibility
          </li>
          <li>
            <strong>Looker Studio</strong> (Data Studio) — one shared dashboard that pulls the above together
          </li>
          <li>
            <strong>Enquiries</strong> — quote form submissions are in the{" "}
            <Link href="/app/enquiries" className="text-brand underline-offset-2 hover:underline">
              Enquiries
            </Link>{" "}
            module (Web tab; WordPress webhook)
          </li>
        </ul>
        <p className="mt-3">
          Paste your real share links below (replace the defaults).
        </p>
      </div>

      {showForm ? (
        <div className="surface-card mb-6 grid gap-3 p-5 md:grid-cols-2">
          <div>
            <label className="label">Title</label>
            <input
              className="field"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Tool</label>
            <SearchSelect
              className="field"
              value={form.tool}
              onChange={(tool) => setForm({ ...form, tool })}
              options={toolOptions}
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
            <label className="label">URL</label>
            <input
              className="field"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <label className="label">Description</label>
            <RichTextEditor
              value={form.description}
              onChange={(description) => setForm({ ...form, description })}
              placeholder="Description…"
              minHeight="70px"
            />
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-primary" onClick={() => void create()}>
              Save
            </button>
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <AdvertisementsPanel
        initial={initialAdvertisements}
        fieldOptions={adFieldOptionsProp}
      />

      <PaidMediaPanel
        initial={initialPaidCampaigns}
        fieldOptions={paidFieldOptionsProp}
      />

      <div className="space-y-8">
        {byCategory.map(([category, list]) => (
          <section key={category}>
            <h2 className="mb-3 font-display text-xl text-brand">{category}</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {list.map((item) => (
                <article key={item.id} className="surface-card p-5">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-accent-soft p-2.5 text-brand">
                      <BarChart3 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium">{item.title}</h3>
                      <p className="text-xs text-muted">{item.tool}</p>
                      {plainTextFromHtml(item.description) ? (
                        <div className="mt-1 text-sm text-muted">
                          <RichTextView html={item.description} />
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {editingId === item.id ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <input
                        className="field flex-1"
                        placeholder="https://…"
                        value={editUrl}
                        onChange={(e) => setEditUrl(e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => void saveUrl(item.id)}
                      >
                        Save link
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {item.url ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-primary"
                        >
                          Open
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      ) : (
                        <span className="btn-secondary pointer-events-none opacity-60">
                          No link yet
                        </span>
                      )}
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          setEditingId(item.id);
                          setEditUrl(item.url);
                        }}
                      >
                        Edit link
                      </button>
                      <button
                        type="button"
                        className="btn-ghost text-[var(--danger)]"
                        onClick={() => void remove(item.id)}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
