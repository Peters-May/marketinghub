"use client";

import { useEffect, useState } from "react";
import { AssetUploadField } from "@/components/content/AssetUploadField";
import {
  SUGGEST_CHANNELS,
  type SuggestChannel,
} from "@/lib/social/suggest";
import type { ContentItem } from "@/lib/types";

function channelsFromItem(item: ContentItem | null): SuggestChannel[] {
  if (!item) return [];
  return SUGGEST_CHANNELS.filter((channel) =>
    item.channel.some((value) => value.toLowerCase() === channel.toLowerCase())
  );
}

export function SuggestPostModal({
  idea,
  onClose,
  onSaved,
}: {
  idea: ContentItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(idea?.title === "Untitled idea" ? "" : idea?.title ?? "");
  const [caption, setCaption] = useState(idea?.caption ?? "");
  const [notes, setNotes] = useState(idea?.notes ?? "");
  const [assetUrl, setAssetUrl] = useState(idea?.asset_url ?? "");
  const [channels, setChannels] = useState<SuggestChannel[]>(() =>
    channelsFromItem(idea)
  );
  const [saving, setSaving] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  function toggleChannel(channel: SuggestChannel) {
    setChannels((current) =>
      current.includes(channel)
        ? current.filter((value) => value !== channel)
        : [...current, channel]
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/content/suggest", {
        method: idea ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: idea?.id,
          title,
          caption,
          notes,
          asset_url: assetUrl,
          channel: channels,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data.error === "string" ? data.error : "Could not save suggestion"
        );
        return;
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save suggestion");
    } finally {
      setSaving(false);
    }
  }

  async function withdraw() {
    if (!idea) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/content/suggest", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: idea.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Could not withdraw suggestion"
        );
        return;
      }
      onSaved();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not withdraw suggestion"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/25 md:left-sidebar"
        onClick={() => {
          if (!saving) onClose();
        }}
        aria-hidden
      />
      <div
        className="fixed left-1/2 top-[6%] z-50 flex max-h-[min(88vh,44rem)] w-[min(100%-1.5rem,36rem)] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-border bg-white shadow-soft md:left-[calc(50%+var(--shell-sidebar-width)/2)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="suggest-post-title"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 id="suggest-post-title" className="text-base font-semibold text-brand">
              {idea ? "Your post idea" : "Suggest a post"}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Marketing can see this and turn it into a scheduled post. Other
              members only see their own ideas.
            </p>
          </div>
          <button
            type="button"
            className="btn-ghost shrink-0 px-2 py-1 text-xs"
            disabled={saving}
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <form
          className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div>
            <label className="label" htmlFor="suggest-title">
              Working title
            </label>
            <input
              id="suggest-title"
              className="field"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Short name for this idea"
            />
          </div>
          <div>
            <label className="label" htmlFor="suggest-caption">
              What should the post say?
            </label>
            <textarea
              id="suggest-caption"
              className="field min-h-[96px]"
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              placeholder="Caption or the point you want to make"
            />
          </div>
          <div>
            <label className="label" htmlFor="suggest-notes">
              Extra information
            </label>
            <textarea
              id="suggest-notes"
              className="field min-h-[72px]"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="When, where, who, or why this matters"
            />
          </div>
          <fieldset>
            <legend className="label">Channels</legend>
            <div className="flex flex-wrap gap-3">
              {SUGGEST_CHANNELS.map((channel) => (
                <label
                  key={channel}
                  className="flex items-center gap-2 text-sm text-slate-800"
                >
                  <input
                    type="checkbox"
                    checked={channels.includes(channel)}
                    onChange={() => toggleChannel(channel)}
                  />
                  {channel}
                </label>
              ))}
            </div>
          </fieldset>
          <AssetUploadField
            multiple
            label="Photos"
            hint="Add photos for the post. Drop, upload, or paste."
            value={assetUrl}
            onChange={setAssetUrl}
          />
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Saving…" : idea ? "Save changes" : "Send idea"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={saving}
              onClick={onClose}
            >
              Cancel
            </button>
            {idea ? (
              <button
                type="button"
                className="btn-ghost ml-auto text-red-700"
                disabled={saving}
                onClick={() => {
                  if (!confirmWithdraw) {
                    setConfirmWithdraw(true);
                    return;
                  }
                  void withdraw();
                }}
              >
                {confirmWithdraw ? "Confirm withdraw" : "Withdraw"}
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </>
  );
}
