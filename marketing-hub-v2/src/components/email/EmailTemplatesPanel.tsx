"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { EmailTemplate } from "@/lib/types";
import { EmptyState } from "@/components/ui/PageHeader";
import { blankDesign, compileEmailDesign } from "@/lib/email/design";

export function EmailTemplatesPanel({
  templates,
  setTemplates,
}: {
  templates: EmailTemplate[];
  setTemplates: React.Dispatch<React.SetStateAction<EmailTemplate[]>>;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function createTemplate() {
    setCreating(true);
    setError("");
    const design = blankDesign();
    try {
      const res = await fetch("/api/email/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Untitled template",
          subject_default: "",
          preview_text_default: "",
          design,
          html_body: compileEmailDesign(design),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Create failed");
      setTemplates((prev) =>
        [...prev, data.item].sort((a, b) => a.name.localeCompare(b.name))
      );
      router.push(`/app/email/design/template/${data.item.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
      setCreating(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this template?")) return;
    await fetch("/api/email/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    setTemplates((prev) => prev.filter((template) => template.id !== id));
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-sm text-muted">
          Design reusable emails with sections and blocks. An unsubscribe link
          is added if it is missing.
        </p>
        <button
          type="button"
          className="btn-primary inline-flex items-center gap-1.5"
          disabled={creating}
          onClick={() => void createTemplate()}
        >
          <Plus className="h-4 w-4" />
          {creating ? "Creating…" : "New template"}
        </button>
      </div>
      {error ? (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {templates.length === 0 ? (
        <EmptyState
          title="No templates"
          description="Start a newsletter or announcement in the visual builder."
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-white">
          {templates.map((template) => (
            <li key={template.id} className="flex items-center gap-2">
              <button
                type="button"
                className="flex min-w-0 flex-1 flex-col gap-0.5 px-4 py-3 text-left hover:bg-slate-50"
                onClick={() =>
                  router.push(`/app/email/design/template/${template.id}`)
                }
              >
                <span className="font-medium text-brand">{template.name}</span>
                <span className="truncate text-xs text-muted">
                  {template.subject_default || "No default subject"}
                </span>
              </button>
              <button
                type="button"
                className="mr-3 text-sm text-red-700"
                onClick={() => void remove(template.id)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
