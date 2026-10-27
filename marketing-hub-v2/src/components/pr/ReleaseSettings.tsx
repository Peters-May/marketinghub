"use client";

import { useState } from "react";
import { useDialog } from "@/components/pr/useDialog";
import { X } from "lucide-react";
import { AssetUploadField } from "@/components/content/AssetUploadField";
import { primaryImageUrl } from "@/lib/data/normalize";
import {
  RELEASE_EDITOR_STATUSES,
  releaseStatusLabel,
  type ReleaseEditorStatus,
} from "@/lib/pr/release-document";
import type { PressReleaseDocument } from "@/lib/types";

const TABS = [
  "Configuration",
  "Thumbnail",
  "Sharing",
  "SEO",
  "Publishing",
] as const;

type Tab = (typeof TABS)[number];

function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start gap-3 rounded-lg bg-mist/60 px-3 py-3">
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <span className="block text-sm font-medium text-brand">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

export function ReleaseSettings({
  open,
  onClose,
  document,
  onDocument,
  image,
  onImage,
  title,
  subtitle,
  placement,
  onPlacement,
  newsroomTitle,
  pinHomepage,
  inSlider,
  onPin,
  onSlider,
  status,
  onStatus,
}: {
  open: boolean;
  onClose: () => void;
  document: PressReleaseDocument;
  onDocument: (next: PressReleaseDocument) => void;
  image: string;
  onImage: (url: string) => void;
  title: string;
  subtitle: string;
  placement: "newsroom" | "standalone";
  onPlacement: (value: "newsroom" | "standalone") => void;
  newsroomTitle: string;
  pinHomepage: boolean;
  inSlider: boolean;
  onPin: (value: boolean) => void;
  onSlider: (value: boolean) => void;
  status: ReleaseEditorStatus;
  onStatus: (value: ReleaseEditorStatus) => void;
}) {
  const [tab, setTab] = useState<Tab>("Configuration");
  const [tag, setTag] = useState("");
  const dialogRef = useDialog(open, onClose);
  if (!open) return null;

  const shareTitle = document.share_title || title || "Untitled";
  const shareText = document.share_description || subtitle;
  const thumb = primaryImageUrl(image);
  const onNewsroom = placement === "newsroom";

  function addTag() {
    const next = tag.trim();
    if (!next) return;
    onDocument({ ...document, tags: [...document.tags, next] });
    setTag("");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 md:left-sidebar">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="release-settings-title"
        className="my-8 w-full max-w-3xl rounded-2xl bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-brand/10 px-5 py-4">
          <h2 id="release-settings-title" className="font-display text-xl text-brand">
            Press release settings
          </h2>
          <button type="button" aria-label="Close settings" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex gap-4 overflow-x-auto border-b border-brand/10 px-5">
          {TABS.map((item) => (
            <button
              key={item}
              type="button"
              className={`border-b-2 py-3 text-sm ${
                tab === item ? "border-accent text-brand" : "border-transparent text-muted"
              }`}
              onClick={() => setTab(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="space-y-4 px-5 py-5">
          {tab === "Configuration" ? (
            <>
              <p className="text-sm text-muted">
                Headings use League Spartan and the body uses Archivo.
              </p>
              <label className="block text-sm">
                <span className="text-xs uppercase tracking-wide text-muted">Newsroom</span>
                <select
                  className="mt-1 w-full rounded-md border border-brand/15 px-3 py-2"
                  value={placement}
                  onChange={(event) =>
                    onPlacement(event.target.value === "standalone" ? "standalone" : "newsroom")
                  }
                >
                  <option value="newsroom">{newsroomTitle || "Newsroom"}</option>
                  <option value="standalone">Standalone press release</option>
                </select>
                <span className="mt-1 block text-xs text-muted">
                  Leave this as standalone to publish the page without listing it on the newsroom.
                </span>
              </label>
              <Toggle
                checked={document.show_date}
                onChange={(show_date) => onDocument({ ...document, show_date })}
                label="Display publication date"
                hint="Shown in the dateline on the release page."
              />
              <label className="block text-sm">
                <span className="text-xs uppercase tracking-wide text-muted">Tags</span>
                <input
                  className="mt-1 w-full rounded-md border border-brand/15 px-3 py-2"
                  value={tag}
                  placeholder="Add a tag and press enter"
                  onChange={(event) => setTag(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addTag();
                    }
                  }}
                />
              </label>
              {document.tags.length ? (
                <ul className="flex flex-wrap gap-2">
                  {document.tags.map((item) => (
                    <li key={item}>
                      <button
                        type="button"
                        className="rounded-full border border-brand/15 px-2 py-1 text-xs"
                        onClick={() =>
                          onDocument({
                            ...document,
                            tags: document.tags.filter((row) => row !== item),
                          })
                        }
                      >
                        {item} ×
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <Toggle
                checked={document.show_tags}
                onChange={(show_tags) => onDocument({ ...document, show_tags })}
                label="Display press release tags"
              />
              <Toggle
                checked={document.journalist_toolbox}
                onChange={(journalist_toolbox) =>
                  onDocument({ ...document, journalist_toolbox })
                }
                label="Journalist’s toolbox"
                hint="Plain text of the release, with the attachments."
              />
            </>
          ) : null}

          {tab === "Thumbnail" ? (
            <div className="space-y-3">
              <AssetUploadField
                label="Feature image"
                hint="Shown on the newsroom and when the story is shared. Min. size 1280×640 px. PNG or JPG. Keep the file under 15MB."
                value={image}
                onChange={onImage}
              />
            </div>
          ) : null}

          {tab === "Sharing" ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <label className="block text-sm">
                  <span className="text-xs uppercase tracking-wide text-muted">Share title</span>
                  <input
                    className="mt-1 w-full rounded-md border border-brand/15 px-3 py-2"
                    value={document.share_title}
                    placeholder={title || "Headline"}
                    onChange={(event) =>
                      onDocument({ ...document, share_title: event.target.value })
                    }
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-xs uppercase tracking-wide text-muted">
                    Share description
                  </span>
                  <textarea
                    className="mt-1 w-full rounded-md border border-brand/15 px-3 py-2"
                    rows={4}
                    value={document.share_description}
                    placeholder={subtitle || "Summary"}
                    onChange={(event) =>
                      onDocument({ ...document, share_description: event.target.value })
                    }
                  />
                </label>
              </div>
              <div className="space-y-4">
                <div className="rounded-lg border border-brand/10 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted">Facebook</p>
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className="mt-2 h-28 w-full rounded object-cover" />
                  ) : (
                    <div className="mt-2 h-28 rounded bg-mist" />
                  )}
                  <p className="mt-2 text-sm font-medium text-brand">{shareTitle}</p>
                  <p className="text-xs text-muted">{shareText}</p>
                </div>
                <div className="rounded-lg border border-brand/10 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted">X</p>
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className="mt-2 h-28 w-full rounded object-cover" />
                  ) : (
                    <div className="mt-2 h-28 rounded bg-mist" />
                  )}
                  <p className="mt-2 text-sm font-medium text-brand">{shareTitle}</p>
                  <p className="text-xs text-muted">{shareText}</p>
                </div>
              </div>
            </div>
          ) : null}

          {tab === "SEO" ? (
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="text-xs uppercase tracking-wide text-muted">Canonical URL</span>
                <input
                  className="mt-1 w-full rounded-md border border-brand/15 px-3 py-2"
                  value={document.seo.canonical}
                  onChange={(event) =>
                    onDocument({
                      ...document,
                      seo: { ...document.seo, canonical: event.target.value },
                    })
                  }
                />
              </label>
              <label className="block text-sm">
                <span className="text-xs uppercase tracking-wide text-muted">Meta keywords</span>
                <textarea
                  className="mt-1 w-full rounded-md border border-brand/15 px-3 py-2"
                  rows={3}
                  value={document.seo.keywords}
                  onChange={(event) =>
                    onDocument({
                      ...document,
                      seo: { ...document.seo, keywords: event.target.value },
                    })
                  }
                />
              </label>
              {(
                [
                  ["noindex", "noindex — do not show this page in search results"],
                  ["nofollow", "nofollow — do not follow the links on this page"],
                  ["noarchive", "noarchive — do not show a cached link in search results"],
                  ["nosnippet", "nosnippet — do not show a text snippet in search results"],
                  ["notranslate", "notranslate — do not offer translation of this page"],
                  ["noimageindex", "noimageindex — do not index images on this page"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={document.seo[key]}
                    onChange={(event) =>
                      onDocument({
                        ...document,
                        seo: { ...document.seo, [key]: event.target.checked },
                      })
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
              <Toggle
                checked={document.seo.redirect_enabled}
                onChange={(redirect_enabled) =>
                  onDocument({
                    ...document,
                    seo: { ...document.seo, redirect_enabled },
                  })
                }
                label="301 redirection"
                hint="Send the public release page to another URL."
              />
              {document.seo.redirect_enabled ? (
                <input
                  className="w-full rounded-md border border-brand/15 px-3 py-2 text-sm"
                  aria-label="Redirect URL"
                  value={document.seo.redirect_url}
                  placeholder="https://"
                  onChange={(event) =>
                    onDocument({
                      ...document,
                      seo: { ...document.seo, redirect_url: event.target.value },
                    })
                  }
                />
              ) : null}
            </div>
          ) : null}

          {tab === "Publishing" ? (
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="text-xs uppercase tracking-wide text-muted">Where it sits</span>
                <select
                  className="mt-1 w-full rounded-md border border-brand/15 px-3 py-2"
                  value={placement}
                  onChange={(event) =>
                    onPlacement(event.target.value === "standalone" ? "standalone" : "newsroom")
                  }
                >
                  <option value="newsroom">{newsroomTitle || "Newsroom"}</option>
                  <option value="standalone">Standalone press release</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-xs uppercase tracking-wide text-muted">Status</span>
                <select
                  className="mt-1 w-full rounded-md border border-brand/15 px-3 py-2"
                  value={status}
                  onChange={(event) => onStatus(event.target.value as ReleaseEditorStatus)}
                >
                  {RELEASE_EDITOR_STATUSES.map((item) => (
                    <option key={item} value={item}>
                      {releaseStatusLabel(item)}
                    </option>
                  ))}
                </select>
              </label>
              <Toggle
                checked={pinHomepage}
                disabled={!onNewsroom}
                onChange={onPin}
                label="Pin to homepage"
                hint="One story is pinned on the newsroom homepage."
              />
              <Toggle
                checked={inSlider}
                disabled={!onNewsroom}
                onChange={onSlider}
                label="Add to slider"
              />
            </div>
          ) : null}
        </div>
        <div className="flex justify-end border-t border-brand/10 px-5 py-4">
          <button
            type="button"
            className="rounded-lg bg-brand px-4 py-2 text-sm text-white"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
