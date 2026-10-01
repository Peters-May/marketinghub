"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { notifyHubDataChanged, type HubDataArea } from "@/lib/command/refresh";

type Preview = { summary: string; verb: "Add" | "Update"; href: string };
type Notice = { message: string; href?: string; examples?: string[] };

export function HubCommandBar() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(confirm: boolean) {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value, confirm }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPreview(null);
        setNotice({
          message: data.error || "The hub could not run that.",
        });
        return;
      }
      if (data.preview) {
        setPreview(data.preview);
        setPreviewText(value);
        return;
      }
      if (data.done) {
        setPreview(null);
        setPreviewText("");
        setText("");
        setNotice({ message: data.done.message, href: data.done.href });
        if (data.done.area) {
          notifyHubDataChanged(data.done.area as HubDataArea);
        }
        router.refresh();
        return;
      }
      setPreview(null);
      setNotice({
        message: data.error || "The hub could not read that.",
        examples: data.examples,
      });
    } catch {
      setNotice({ message: "The hub could not run that. Try again." });
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const ready = preview && text.trim() === previewText;
    void submit(Boolean(ready));
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-5xl">
      <label
        htmlFor="hub-command"
        className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted"
      >
        Tell the hub what to do
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="hub-command"
          value={text}
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            if (preview && next.trim() !== previewText) setPreview(null);
          }}
          placeholder="Add a task, update an event, add a post…"
          autoComplete="off"
          className="min-w-0 flex-1 rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none ring-brand/30 placeholder:text-muted focus:ring-2"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            className="btn-primary shrink-0 px-4 py-2 disabled:opacity-50"
            disabled={busy || !text.trim()}
          >
            {busy ? "Working…" : preview ? preview.verb : "Run"}
          </button>
          {preview ? (
            <button
              type="button"
              className="btn-secondary shrink-0 px-4 py-2"
              onClick={() => setPreview(null)}
            >
              Cancel
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-2 min-h-5 text-sm" aria-live="polite">
        {preview ? (
          <p className="text-brand">{preview.summary} Confirm to save.</p>
        ) : notice ? (
          <p className={notice.href ? "text-brand" : "text-muted"}>
            {notice.message}{" "}
            {notice.href ? (
              <Link href={notice.href} className="font-medium underline">
                Open it
              </Link>
            ) : null}
          </p>
        ) : (
          <p className="text-muted">
            For example: Add a task to call the organiser, due Friday.
          </p>
        )}
        {notice?.examples?.length ? (
          <ul className="mt-1 list-disc pl-5 text-muted">
            {notice.examples.slice(0, 3).map((example) => (
              <li key={example}>{example}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </form>
  );
}
