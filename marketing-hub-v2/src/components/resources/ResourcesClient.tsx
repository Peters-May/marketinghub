"use client";

import { useState } from "react";
import { Download, ExternalLink } from "lucide-react";
import type { ResourceLink } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormAlert } from "@/components/ui/FormAlert";
import { apiErrorMessage } from "@/lib/ui/form-feedback";
import {
  optionsForField,
  RESOURCE_CATEGORIES,
  type FieldOption,
} from "@/lib/data/collections";
import { useManagedFieldOptions } from "@/lib/data/useManagedFieldOptions";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { RichTextView } from "@/components/ui/RichTextView";
import { plainTextFromHtml } from "@/lib/plain-text";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { removeById, rowFromResponse, upsertById } from "@/lib/data/list-patch";

export function ResourcesClient({
  initial,
  hideHeader = false,
  allowManage = true,
  fieldOptions: fieldOptionsProp,
}: {
  initial: ResourceLink[];
  hideHeader?: boolean;
  /** When false (Member view), hide add/delete — open & download only. */
  allowManage?: boolean;
  fieldOptions?: Record<string, FieldOption[]>;
}) {
  const fieldOptions = useManagedFieldOptions("resources", fieldOptionsProp);
  const categoryOptions = optionsForField(
    fieldOptions,
    "category",
    RESOURCE_CATEGORIES
  );
  const [items, setItems] = useState(initial);
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    url: "",
    category: "Press",
  });

  async function create() {
    if (!allowManage) return;
    const res = await fetch("/api/resources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    const item = rowFromResponse<ResourceLink>(data);
    if (!res.ok || !item) {
      setFormError(apiErrorMessage(data, "Could not save resource"));
      return;
    }
    setItems((prev) => upsertById(prev, item));
    setShowForm(false);
    setForm({ title: "", description: "", url: "", category: "Press" });
  }

  async function remove(id: string) {
    if (!allowManage) return;
    const res = await fetch("/api/resources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFormError(apiErrorMessage(data, "Could not delete resource"));
      return;
    }
    setItems((prev) => removeById(prev, id));
  }

  const byCategory = items.reduce<Record<string, ResourceLink[]>>((acc, item) => {
    const key = item.category || "General";
    (acc[key] ??= []).push(item);
    return acc;
  }, {});

  return (
    <div>
      <FormAlert message={formError} />
      {hideHeader ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl text-brand">Resources</h2>
            {!allowManage ? (
              <p className="mt-0.5 text-xs text-muted">
                Open or download linked files
              </p>
            ) : null}
          </div>
          {allowManage ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => setShowForm(true)}
            >
              Add link
            </button>
          ) : null}
        </div>
      ) : (
        <PageHeader
          title="Resources"
          description="Curated OneDrive / SharePoint links for press releases, brand kits, and templates."
          actions={
            allowManage ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => setShowForm(true)}
              >
                Add link
              </button>
            ) : undefined
          }
        />
      )}

      {allowManage && showForm ? (
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
            <label className="label">Category</label>
            <SearchSelect
              className="field"
              value={form.category}
              onChange={(category) => setForm({ ...form, category })}
              options={categoryOptions}
            />
          </div>
          <div className="md:col-span-2">
            <label className="label">URL</label>
            <input
              className="field"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://…"
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

      <div className="space-y-8">
        {Object.entries(byCategory).map(([category, list]) => (
          <section key={category}>
            <h2 className="mb-3 font-display text-xl text-brand">{category}</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {list.map((item) => (
                <article key={item.id} className="surface-card p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-medium">{item.title}</h3>
                      {plainTextFromHtml(item.description) ? (
                        <div className="mt-1 text-sm text-muted">
                          <RichTextView html={item.description} />
                        </div>
                      ) : null}
                    </div>
                    {allowManage ? (
                      <button
                        type="button"
                        className="text-xs text-[var(--danger)]"
                        onClick={() => void remove(item.id)}
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                  {item.url ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-secondary"
                      >
                        Open link
                        <ExternalLink className="h-4 w-4" />
                      </a>
                      <a
                        href={item.url}
                        download
                        target="_blank"
                        rel="noreferrer"
                        className="btn-primary"
                      >
                        <Download className="h-4 w-4" />
                        Download
                      </a>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
