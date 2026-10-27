"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ContentItem } from "@/lib/types";
import { AssetUploadField } from "@/components/content/AssetUploadField";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import {
  ReleaseBlockEditor,
  type ReleaseSpokesperson,
} from "@/components/pr/ReleaseBlockEditor";
import { ReleaseSettings } from "@/components/pr/ReleaseSettings";
import { parseAssetUrls } from "@/lib/data/normalize";
import { plainTextFromHtml } from "@/lib/plain-text";
import {
  editorStatusFromContent,
  isPublicReleasePage,
  pressReleaseSaveError,
  RELEASE_EDITOR_STATUSES,
  releaseStatusLabel,
  type ReleaseEditorStatus,
} from "@/lib/pr/release-document";
import { attachmentNameFromUrl, seedReleaseDocument } from "@/lib/pr/release-blocks";
import type { ReleaseAttachment } from "@/lib/types";

export type { ReleaseSpokesperson };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function fileName(url: string): string {
  return attachmentNameFromUrl(url);
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
  const [subtitle, setSubtitle] = useState(() => plainTextFromHtml(item?.caption ?? ""));
  const [location, setLocation] = useState(item?.pr_location ?? "");
  const [date, setDate] = useState(item?.due_date?.slice(0, 10) || todayIso());
  const [image, setImage] = useState(item?.asset_url ?? "");
  const [boilerplate, setBoilerplate] = useState(
    item?.pr_boilerplate || (item ? "" : newsroomDescription)
  );
  const [contact, setContact] = useState(item?.pr_contact ?? "");
  const [document, setDocument] = useState(() =>
    seedReleaseDocument(item?.pr_document, item?.notes ?? "")
  );
  const [status, setStatus] = useState<ReleaseEditorStatus>(
    editorStatusFromContent(item?.status)
  );
  const [placement, setPlacement] = useState<"newsroom" | "standalone">(
    item?.newsroom_name === "" ? "standalone" : "newsroom"
  );
  const [pinHomepage, setPinHomepage] = useState(item?.pin_homepage === true);
  const [inSlider, setInSlider] = useState(item?.in_slider === true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [clean, setClean] = useState(true);
  const editRevision = useRef(0);

  function mark() {
    editRevision.current += 1;
    setClean(false);
  }

  useEffect(() => {
    if (clean) return;
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [clean]);

  function setAttachments(joined: string) {
    const urls = parseAssetUrls(joined);
    const attachments: ReleaseAttachment[] = urls.map((url) => {
      const existing = document.attachments.find((file) => file.url === url);
      return existing ?? { url, name: fileName(url) };
    });
    setDocument({ ...document, attachments });
    mark();
  }

  async function save(nextStatus: ReleaseEditorStatus): Promise<ContentItem | null> {
    const saveError = pressReleaseSaveError({
      title,
      status: nextStatus,
      due_date: date || null,
    });
    if (saveError) {
      setError(saveError);
      return null;
    }
    const revision = editRevision.current;
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
          notes: "",
          due_date: date || null,
          asset_url: image,
          pr_location: location,
          pr_boilerplate: boilerplate,
          pr_contact: contact,
          pr_document: document,
          status: nextStatus,
          newsroom_title: newsroomTitle,
          placement,
          pin_homepage: pinHomepage,
          in_slider: inSlider,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the release");
      setSavedId(data.item.id);
      onSaved(data.item);
      if (editRevision.current !== revision) return data.item as ContentItem;
      setStatus(editorStatusFromContent(data.item.status));
      if (data.item.pr_document) setDocument(data.item.pr_document);
      setClean(true);
      setNotice(
        data.item.status === "published"
          ? placement === "newsroom"
            ? "Published to the newsroom."
            : "Published as a standalone release."
          : "Saved."
      );
      return data.item as ContentItem;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the release");
      return null;
    } finally {
      setBusy(false);
    }
  }

  function leave() {
    if (!clean && !window.confirm("Leave without saving this release?")) return;
    onClose();
  }

  async function preview() {
    const live = status === "published" || status === "scheduled";
    if (live) {
      if (!savedId) {
        setError("Save this release as a draft before opening a preview.");
        return;
      }
      if (!clean) {
        setNotice(
          "Preview shows the last saved version. These edits stay off the live release."
        );
      }
      window.open(`/newsroom/preview/${savedId}`, "_blank", "noopener");
      return;
    }
    const saved = clean && savedId ? { id: savedId } : await save(status);
    if (!saved) return;
    window.open(`/newsroom/preview/${saved.id}`, "_blank", "noopener");
  }

  async function saveAndExit() {
    const saved = await save(status);
    if (saved) onClose();
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
    mark();
  }

  const live = isPublicReleasePage({
    status,
    newsroom_name: placement === "standalone" ? "" : newsroomTitle,
    due_date: date || null,
    content_type: "PR",
    category: "press release",
    channel: ["PR"],
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={leave}
          className="inline-flex items-center gap-1.5 text-sm text-brand"
        >
          <ArrowLeft className="h-4 w-4" />
          Releases
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-brand/20 px-3 py-2 text-sm text-brand"
            onClick={() => setSettingsOpen(true)}
          >
            Settings
          </button>
          <label className="text-sm">
            <span className="sr-only">Status</span>
            <select
              className="rounded-lg border border-brand/20 px-3 py-2"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as ReleaseEditorStatus);
                mark();
              }}
            >
              {RELEASE_EDITOR_STATUSES.map((itemStatus) => (
                <option key={itemStatus} value={itemStatus}>
                  {releaseStatusLabel(itemStatus)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void preview()}
            className="rounded-lg border border-brand/20 px-3 py-2 text-sm text-brand disabled:opacity-50"
          >
            Preview
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save(status)}
            className="rounded-lg border border-brand/20 px-3 py-2 text-sm text-brand disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveAndExit()}
            className="rounded-lg bg-brand px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            Save and exit
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
          {savedId && live ? (
            <>
              {" "}
              <Link
                href={`/newsroom/${savedId}`}
                target="_blank"
                className="text-accent underline"
              >
                {placement === "newsroom" ? "View on the newsroom" : "View the release"}
              </Link>
            </>
          ) : null}
        </p>
      ) : null}

      <div className="rounded-xl border border-border bg-white px-5 py-6 shadow-sm md:px-8 md:py-8">
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-muted">Headline</span>
          <input
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              mark();
            }}
            placeholder="Write the headline"
            className="mt-1 w-full border-0 bg-transparent font-display text-3xl leading-tight text-brand outline-none placeholder:text-brand/25"
          />
        </label>
        <label className="mt-4 block">
          <span className="text-xs uppercase tracking-wide text-muted">Summary</span>
          <textarea
            value={subtitle}
            onChange={(event) => {
              setSubtitle(event.target.value);
              mark();
            }}
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
              onChange={(event) => {
                setLocation(event.target.value);
                mark();
              }}
              placeholder="London"
              className="mt-1 block w-40 rounded-md border border-brand/15 px-3 py-2 uppercase"
            />
          </label>
          <label className="text-sm">
            <span className="text-xs uppercase tracking-wide text-muted">Date</span>
            <input
              type="date"
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                mark();
              }}
              className="mt-1 block rounded-md border border-brand/15 px-3 py-2"
            />
          </label>
        </div>

        <div className="mt-6">
          <AssetUploadField
            label="Feature image"
            hint="Shown under the headline on the newsroom and used when the story is shared."
            value={image}
            onChange={(url) => {
              setImage(url);
              mark();
            }}
          />
        </div>

        <div className="mt-8">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted">Story</p>
          <ReleaseBlockEditor
            blocks={document.blocks}
            spokespeople={spokespeople}
            onChange={(blocks) => {
              setDocument({ ...document, blocks });
              mark();
            }}
          />
        </div>

        <div className="mt-8">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted">
            About Peters &amp; May
          </p>
          <RichTextEditor
            value={boilerplate}
            onChange={(value) => {
              setBoilerplate(value);
              mark();
            }}
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
                onChange={(event) => applySpokesperson(event.target.value)}
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
            onChange={(event) => {
              setContact(event.target.value);
              mark();
            }}
            rows={4}
            placeholder={"Media enquiries\nPeters & May\nmarketing@petersandmay.com"}
            className="w-full rounded-md border border-brand/15 px-3 py-2 text-sm"
          />
        </div>

        <div className="mt-8 border-t border-brand/10 pt-6">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted">Attachments</p>
          <AssetUploadField
            multiple
            label="Files"
            hint="Shown at the bottom of the release and in the pitch email."
            value={document.attachments.map((file) => file.url).join("\n")}
            onChange={setAttachments}
          />
          {document.attachments.length ? (
            <ul className="mt-3 space-y-2">
              {document.attachments.map((file) => (
                <li key={file.url}>
                  <input
                    className="w-full rounded-md border border-brand/15 px-3 py-2 text-sm"
                    value={file.name}
                    onChange={(event) => {
                      setDocument({
                        ...document,
                        attachments: document.attachments.map((row) =>
                          row.url === file.url ? { ...row, name: event.target.value } : row
                        ),
                      });
                      mark();
                    }}
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <ReleaseSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        document={document}
        onDocument={(next) => {
          setDocument(next);
          mark();
        }}
        image={image}
        onImage={(url) => {
          setImage(url);
          mark();
        }}
        title={title}
        subtitle={subtitle}
        placement={placement}
        onPlacement={(value) => {
          setPlacement(value);
          mark();
        }}
        newsroomTitle={newsroomTitle}
        pinHomepage={pinHomepage}
        inSlider={inSlider}
        onPin={(value) => {
          setPinHomepage(value);
          mark();
        }}
        onSlider={(value) => {
          setInSlider(value);
          mark();
        }}
        status={status}
        onStatus={(value) => {
          setStatus(value);
          mark();
        }}
      />
    </div>
  );
}
