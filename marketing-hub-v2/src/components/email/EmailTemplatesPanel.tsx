"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { EmailTemplate } from "@/lib/types";
import { EmptyState } from "@/components/ui/PageHeader";
import { RecordDrawer } from "@/components/ui/RecordDrawer";
import { applyEmailMerge, ensureUnsubscribeFooter } from "@/lib/email/merge";
import { cn } from "@/lib/utils";

type FormState = {
  name: string;
  subject_default: string;
  preview_text_default: string;
  html_body: string;
};

function emptyForm(): FormState {
  return {
    name: "",
    subject_default: "",
    preview_text_default: "",
    html_body: ensureUnsubscribeFooter(
      "<p>Hello {{name}},</p>\n<p>Your message here.</p>"
    ),
  };
}

function toForm(t: EmailTemplate): FormState {
  return {
    name: t.name,
    subject_default: t.subject_default,
    preview_text_default: t.preview_text_default,
    html_body: t.html_body,
  };
}

export function EmailTemplatesPanel({
  templates,
  setTemplates,
}: {
  templates: EmailTemplate[];
  setTemplates: React.Dispatch<React.SetStateAction<EmailTemplate[]>>;
}) {
  const [selected, setSelected] = useState<EmailTemplate | null>(null);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const previewHtml = useMemo(() => {
    return applyEmailMerge(ensureUnsubscribeFooter(form.html_body), {
      contact: {
        id: "preview",
        kind: "person",
        name: "Alex Example",
        organisation: "Example Yacht Co",
        role: "",
        email: "alex@example.com",
        phone: "",
        website: "",
        services: "",
        tags: [],
        notes: "",
        user_id: null,
        is_press: false,
        beat: "",
        outlet: "",
        country: "United Kingdom",
        preferred_topics: "",
        last_contacted_at: null,
        marketing_consent: true,
        created_at: "",
        updated_at: "",
      },
      unsubscribeUrl: "https://example.com/unsubscribe",
    });
  }, [form.html_body]);

  async function save() {
    setSaving(true);
    setError("");
    const payload = {
      name: form.name || "Untitled template",
      subject_default: form.subject_default,
      preview_text_default: form.preview_text_default,
      html_body: ensureUnsubscribeFooter(form.html_body),
    };
    try {
      if (creating) {
        const res = await fetch("/api/email/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Create failed");
        setTemplates((prev) =>
          [...prev, data.item].sort((a, b) => a.name.localeCompare(b.name))
        );
        setSelected(data.item);
        setCreating(false);
        setForm(toForm(data.item));
      } else if (selected) {
        const res = await fetch("/api/email/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update",
            id: selected.id,
            patch: payload,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Update failed");
        setTemplates((prev) =>
          prev.map((t) => (t.id === data.item.id ? data.item : t))
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
    if (!window.confirm("Delete this template?")) return;
    await fetch("/api/email/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    setOpen(false);
    setSelected(null);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-sm text-muted">
          HTML templates with merge fields. An unsubscribe link is added if
          missing.
        </p>
        <button
          type="button"
          className="btn-primary inline-flex items-center gap-1.5"
          onClick={() => {
            setCreating(true);
            setSelected(null);
            setForm(emptyForm());
            setOpen(true);
            setShowPreview(false);
            setError("");
          }}
        >
          <Plus className="h-4 w-4" />
          New template
        </button>
      </div>

      {templates.length === 0 ? (
        <EmptyState
          title="No templates"
          description="Save reusable HTML for newsletters and e-shots."
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-white">
          {templates.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className={cn(
                  "flex w-full flex-col gap-0.5 px-4 py-3 text-left hover:bg-slate-50",
                  selected?.id === t.id && "bg-slate-50"
                )}
                onClick={() => {
                  setSelected(t);
                  setCreating(false);
                  setForm(toForm(t));
                  setOpen(true);
                  setShowPreview(false);
                  setError("");
                }}
              >
                <span className="font-medium text-brand">{t.name}</span>
                <span className="text-xs text-muted">
                  {t.subject_default || "No default subject"}
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
        title={creating ? "New template" : selected?.name || "Template"}
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
            <span className="text-muted">Default subject</span>
            <input
              className="input mt-1 w-full"
              value={form.subject_default}
              onChange={(e) =>
                setForm({ ...form, subject_default: e.target.value })
              }
            />
          </label>

          <label className="block text-sm">
            <span className="text-muted">Default preview text</span>
            <input
              className="input mt-1 w-full"
              value={form.preview_text_default}
              onChange={(e) =>
                setForm({ ...form, preview_text_default: e.target.value })
              }
            />
          </label>

          <label className="block text-sm">
            <span className="text-muted">HTML body</span>
            <textarea
              className="input mt-1 min-h-[200px] w-full font-mono text-xs"
              value={form.html_body}
              onChange={(e) => setForm({ ...form, html_body: e.target.value })}
            />
          </label>

          <button
            type="button"
            className="btn-secondary text-sm"
            onClick={() => setShowPreview((v) => !v)}
          >
            {showPreview ? "Hide preview" : "Show preview"}
          </button>

          {showPreview ? (
            <div className="overflow-hidden rounded-lg border border-border bg-white">
              <div className="border-b border-border px-3 py-1.5 text-xs text-muted">
                Preview (sample merge)
              </div>
              <iframe
                title="Template preview"
                className="h-64 w-full"
                sandbox=""
                srcDoc={previewHtml}
              />
            </div>
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
