"use client";

import { useState } from "react";
import { audienceCopy } from "@/lib/share/review";
import type { ShareAudience, ShareReviewDecision } from "@/lib/types";

type TaggedPerson = { name: string; email?: string };

export function ShareApprovalForm({
  token,
  audience,
  mode,
  initialCaption = "",
  initialSubject = "",
}: {
  token: string;
  audience: ShareAudience;
  mode: "content" | "email";
  initialCaption?: string;
  initialSubject?: string;
}) {
  const copy = audienceCopy(audience);
  const [decision, setDecision] = useState<ShareReviewDecision | null>(null);
  const [caption, setCaption] = useState(initialCaption);
  const [subject, setSubject] = useState(initialSubject);
  const [notes, setNotes] = useState("");
  const [approvedByName, setApprovedByName] = useState("");
  const [approvedByEmail, setApprovedByEmail] = useState("");
  const [approvedByRole, setApprovedByRole] = useState("");
  const [tagName, setTagName] = useState("");
  const [tagEmail, setTagEmail] = useState("");
  const [people, setPeople] = useState<TaggedPerson[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function addPerson() {
    const name = tagName.trim();
    if (!name) return;
    setPeople((prev) => [
      ...prev,
      tagEmail.trim() ? { name, email: tagEmail.trim() } : { name },
    ]);
    setTagName("");
    setTagEmail("");
  }

  async function uploadImage(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(
        `/api/share/review/${encodeURIComponent(token)}/upload`,
        { method: "POST", body: form }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not upload image");
        return;
      }
      const url = String(data.url ?? "");
      if (url) setImages((prev) => [...prev, url]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not upload image");
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (!decision || busy) return;
    if (!approvedByName.trim()) {
      setError(`${copy.byLabelApprove} name is required`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/share/review/${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision,
            amended_caption: mode === "content" ? caption : undefined,
            amended_subject: mode === "email" ? subject : undefined,
            notes,
            tagged_people: people,
            added_image_urls: images,
            approved_by_name: approvedByName.trim(),
            approved_by_email: approvedByEmail.trim(),
            approved_by_role: approvedByRole.trim(),
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not send response");
        return;
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send response");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-border bg-white p-6 text-center">
        <h2 className="font-display text-2xl text-brand">{copy.thanksTitle}</h2>
        <p className="mt-2 text-sm text-muted">{copy.thanksBody}</p>
      </div>
    );
  }

  const byLabel =
    decision === "changes_requested"
      ? copy.byLabelChanges
      : copy.byLabelApprove;

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-white p-5">
      <div>
        <h2 className="font-display text-xl text-brand">Your response</h2>
        <p className="mt-1 text-sm text-muted">
          Approve as-is, or request changes with notes and amended copy.
          Marketing applies the final publish.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={
            decision === "approved" ? "btn-primary" : "btn-secondary"
          }
          onClick={() => setDecision("approved")}
        >
          {copy.approveLabel}
        </button>
        <button
          type="button"
          className={
            decision === "changes_requested" ? "btn-primary" : "btn-secondary"
          }
          onClick={() => setDecision("changes_requested")}
        >
          {copy.changesLabel}
        </button>
      </div>

      {mode === "content" ? (
        <label className="block text-sm">
          <span className="font-medium text-brand">Caption / copy</span>
          <textarea
            className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
            rows={5}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
          />
        </label>
      ) : (
        <label className="block text-sm">
          <span className="font-medium text-brand">Subject line</span>
          <input
            className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <span className="mt-1 block text-xs text-muted">
            Body amendments go in notes — the HTML preview stays read-only.
          </span>
        </label>
      )}

      <label className="block text-sm">
        <span className="font-medium text-brand">Notes</span>
        <textarea
          className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Amendments, context, or open questions"
        />
      </label>

      <div className="space-y-2">
        <p className="text-sm font-medium text-brand">Tag people</p>
        <div className="flex flex-wrap gap-2">
          <input
            className="min-w-[10rem] flex-1 rounded-xl border border-border px-3 py-2 text-sm"
            placeholder="Name"
            value={tagName}
            onChange={(e) => setTagName(e.target.value)}
          />
          <input
            className="min-w-[10rem] flex-1 rounded-xl border border-border px-3 py-2 text-sm"
            placeholder="Email (optional)"
            value={tagEmail}
            onChange={(e) => setTagEmail(e.target.value)}
          />
          <button type="button" className="btn-secondary" onClick={addPerson}>
            Add
          </button>
        </div>
        {people.length ? (
          <ul className="space-y-1 text-sm text-slate-700">
            {people.map((p, i) => (
              <li key={`${p.name}-${i}`} className="flex items-center gap-2">
                <span>
                  {p.name}
                  {p.email ? ` · ${p.email}` : ""}
                </span>
                <button
                  type="button"
                  className="text-xs text-muted underline"
                  onClick={() =>
                    setPeople((prev) => prev.filter((_, idx) => idx !== i))
                  }
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-brand">Attach more images</p>
        <input
          type="file"
          accept="image/*"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadImage(file);
            e.target.value = "";
          }}
        />
        {images.length ? (
          <ul className="space-y-1 text-xs text-slate-600">
            {images.map((url) => (
              <li key={url} className="break-all">
                <a href={url} target="_blank" rel="noreferrer" className="underline">
                  {url}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm sm:col-span-1">
          <span className="font-medium text-brand">{byLabel} *</span>
          <input
            className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm"
            value={approvedByName}
            onChange={(e) => setApprovedByName(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-brand">Role (optional)</span>
          <input
            className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm"
            value={approvedByRole}
            onChange={(e) => setApprovedByRole(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-brand">Email (optional)</span>
          <input
            className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm"
            value={approvedByEmail}
            onChange={(e) => setApprovedByEmail(e.target.value)}
          />
        </label>
      </div>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

      <button
        type="button"
        className="btn-primary"
        disabled={!decision || busy || uploading}
        onClick={() => void submit()}
      >
        {busy ? "Sending…" : copy.submitLabel}
      </button>
    </div>
  );
}
