"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ContentItem } from "@/lib/types";
import { AssetUploadField } from "@/components/content/AssetUploadField";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { ReleaseArticle } from "@/components/pr/ReleaseArticle";
import { plainTextFromHtml } from "@/lib/plain-text";

export type ReleaseSpokesperson = {
  id: string;
  name: string;
  role: string;
  organisation: string;
  email: string;
  phone: string;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function ReleaseEditor({
  item,
  newsroomTitle,
  newsroomDescription,
  spokespeople,
  onClose,
  onSaved,
}: {
  item: ContentItem | null;
  newsroomTitle: string;
  newsroomDescription: string;
  spokespeople: ReleaseSpokesperson[];
  onClose: () => void;
  onSaved: (item: ContentItem) => void;
}) {
  const [savedId, setSavedId] = useState(item?.id ?? "");
  const [title, setTitle] = useState(item?.title ?? "");
  const [subtitle, setSubtitle] = useState(() =>
    plainTextFromHtml(item?.caption ?? "")
  );
  const [location, setLocation] = useState(item?.pr_location ?? "");
  const [date, setDate] = useState(item?.due_date?.slice(0, 10) || todayIso());
  const [body, setBody] = useState(item?.notes ?? "");
  const [image, setImage] = useState(item?.asset_url ?? "");
  const [boilerplate, setBoilerplate] = useState(
    item?.pr_boilerplate || (item ? "" : newsroomDescription)
  );
  const [contact, setContact] = useState(item?.pr_contact ?? "");
  const [status, setStatus] = useState<"draft" | "published">(
    item?.status === "published" ? "published" : "draft"
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showPreview, setShowPreview] = useState(true);

  async function save(nextStatus: "draft" | "published") {
    if (!title.trim()) {
      setError("Add a headline before saving.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_press_release",
          id: savedId || undefined,
          title,
          caption: subtitle,
          notes: body,
          due_date: date || null,
          asset_url: image,
          pr_location: location,
          pr_boilerplate: boilerplate,
          pr_contact: contact,
          status: nextStatus,
          newsroom_title: newsroomTitle,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the release");
      setSavedId(data.item.id);
      setStatus(data.item.status === "published" ? "published" : "draft");
      onSaved(data.item);
      setNotice(
        nextStatus === "published"
          ? "Published to the newsroom."
          : "Draft saved."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the release");
    } finally {
      setBusy(false);
    }
  }

  function applySpokesperson(id: string) {
    const person = spokespeople.find((row) => row.id === id);
    if (!person) return;
    const lines = [
      person.name,
      [person.role, person.organisation].filter(Boolean).join(", "),
      person.email,
      person.phone,
    ].filter(Boolean);
    setContact(lines.join("\n"));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 text-sm text-brand"
        >
          <ArrowLeft className="h-4 w-4" />
          Releases
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-brand/20 px-3 py-2 text-sm text-brand"
            onClick={() => setShowPreview((open) => !open)}
          >
            {showPreview ? "Hide preview" : "Show preview"}
          </button>
          {status === "published" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void save("draft")}
              className="rounded-lg border border-brand/20 px-3 py-2 text-sm text-brand disabled:opacity-50"
            >
              Move to draft
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void save("draft")}
              className="rounded-lg border border-brand/20 px-3 py-2 text-sm text-brand disabled:opacity-50"
            >
              Save draft
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void save("published")}
            className="rounded-lg bg-brand px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            {status === "published" ? "Update release" : "Publish"}
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-lg border border-brand/15 bg-mist px-3 py-2 text-sm text-brand">
          {notice}
          {status === "published" && savedId ? (
            <>
              {" "}
              <Link
                href={`/newsroom/${savedId}`}
                target="_blank"
                className="text-accent underline"
              >
                View on the newsroom
              </Link>
            </>
          ) : null}
        </p>
      ) : null}

      <div className={showPreview ? "grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]" : ""}>
        <div className="rounded-xl border border-border bg-white px-5 py-6 shadow-sm md:px-8 md:py-8">
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-muted">Headline</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Write the headline"
              className="mt-1 w-full border-0 bg-transparent font-display text-3xl leading-tight text-brand outline-none placeholder:text-brand/25"
            />
          </label>
          <label className="mt-4 block">
            <span className="text-xs uppercase tracking-wide text-muted">Subtitle</span>
            <textarea
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              rows={2}
              placeholder="One or two lines that summarise the story"
              className="mt-1 w-full resize-none border-0 bg-transparent text-lg leading-relaxed text-brand/80 outline-none placeholder:text-brand/25"
            />
          </label>
          <div className="mt-4 flex flex-wrap items-end gap-3 border-y border-brand/10 py-3">
            <label className="text-sm">
              <span className="text-xs uppercase tracking-wide text-muted">Location</span>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="London"
                className="mt-1 block w-40 rounded-md border border-brand/15 px-3 py-2 uppercase"
              />
            </label>
            <label className="text-sm">
              <span className="text-xs uppercase tracking-wide text-muted">Date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 block rounded-md border border-brand/15 px-3 py-2"
              />
            </label>
          </div>

          <div className="mt-6">
            <AssetUploadField
              label="Image"
              hint="Shown under the headline on the newsroom."
              value={image}
              onChange={setImage}
            />
          </div>

          <div className="mt-6">
            <p className="mb-2 text-xs uppercase tracking-wide text-muted">Story</p>
            <RichTextEditor
              value={body}
              onChange={setBody}
              placeholder="Write the release. Use quote for a spokesperson line."
              minHeight="280px"
            />
          </div>

          <div className="mt-8">
            <p className="mb-2 text-xs uppercase tracking-wide text-muted">
              About Peters &amp; May
            </p>
            <RichTextEditor
              value={boilerplate}
              onChange={setBoilerplate}
              placeholder="Short company boilerplate for the foot of the release."
              minHeight="120px"
            />
          </div>

          <div className="mt-8">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-wide text-muted">Media contact</p>
              {spokespeople.length > 0 ? (
                <select
                  className="rounded-md border border-brand/15 px-2 py-1 text-sm"
                  defaultValue=""
                  onChange={(e) => applySpokesperson(e.target.value)}
                >
                  <option value="">Add a spokesperson…</option>
                  {spokespeople.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
            <textarea
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              rows={4}
              placeholder={"Name\nRole\nemail@petersandmay.com\nPhone"}
              className="w-full rounded-md border border-brand/15 px-3 py-2 text-sm"
            />
          </div>
        </div>

        {showPreview ? (
          <aside className="rounded-xl border border-border bg-mist/50 p-5">
            <p className="text-xs uppercase tracking-wide text-muted">Preview</p>
            <div className="mt-4 rounded-xl bg-white p-5">
              <ReleaseArticle
                title={title}
                subtitle={subtitle}
                location={location}
                date={date || null}
                body={body}
                imageUrl={image}
                boilerplate={boilerplate}
                contact={contact}
              />
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
