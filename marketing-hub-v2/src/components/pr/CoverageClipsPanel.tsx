"use client";

import { useState } from "react";
import type { PrCoverage, PrCoverageChannel, PrCoverageSentiment } from "@/lib/types";
import { EmptyState } from "@/components/ui/PageHeader";
import { AssetUploadField } from "@/components/content/AssetUploadField";
import { coverageToCsv } from "@/lib/pr/coverage-csv";
import { downloadTextFile } from "@/lib/pr/pitch-eml";
import { PR_COVERAGE_CHANNELS } from "@/lib/pr/coverage-channel";

type ClipForm = {
  title: string;
  url: string;
  outlet: string;
  published_at: string;
  notes: string;
  sentiment: PrCoverageSentiment;
  channel: PrCoverageChannel;
  screenshot_url: string;
  audience: string;
  estimated_views: string;
  domain_authority: string;
};

const EMPTY_FORM: ClipForm = {
  title: "",
  url: "",
  outlet: "",
  published_at: "",
  notes: "",
  sentiment: "",
  channel: "",
  screenshot_url: "",
  audience: "",
  estimated_views: "",
  domain_authority: "",
};

function metricOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function CoverageClipsPanel({
  coverage,
  busy,
  onBusy,
  onMessage,
  onRefresh,
}: {
  coverage: PrCoverage[];
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onMessage: (message: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const [clipForm, setClipForm] = useState<ClipForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ClipForm>(EMPTY_FORM);
  const [ogBusy, setOgBusy] = useState(false);

  async function createClip() {
    onBusy(true);
    try {
      const res = await fetch("/api/pr/coverage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...clipForm,
          published_at: clipForm.published_at || null,
          audience: metricOrNull(clipForm.audience),
          estimated_views: metricOrNull(clipForm.estimated_views),
          domain_authority: metricOrNull(clipForm.domain_authority),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not log the clip");
      setClipForm(EMPTY_FORM);
      await onRefresh();
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Could not log the clip");
    } finally {
      onBusy(false);
    }
  }

  async function updateCoverageSentiment(
    id: string,
    sentiment: PrCoverageSentiment
  ) {
    const res = await fetch("/api/pr/coverage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", id, patch: { sentiment } }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      onMessage(data.error || "Could not update sentiment");
      return;
    }
    await onRefresh();
  }

  function startEdit(clip: PrCoverage) {
    setEditingId(clip.id);
    setEditForm({
      title: clip.title,
      url: clip.url,
      outlet: clip.outlet,
      published_at: clip.published_at ? clip.published_at.slice(0, 10) : "",
      notes: clip.notes,
      sentiment: clip.sentiment,
      channel: clip.channel || "",
      screenshot_url: clip.screenshot_url || "",
      audience: clip.audience == null ? "" : String(clip.audience),
      estimated_views:
        clip.estimated_views == null ? "" : String(clip.estimated_views),
      domain_authority:
        clip.domain_authority == null ? "" : String(clip.domain_authority),
    });
  }

  async function saveEdit() {
    if (!editingId) return;
    onBusy(true);
    try {
      const res = await fetch("/api/pr/coverage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: editingId,
          patch: {
            ...editForm,
            published_at: editForm.published_at || null,
            audience: metricOrNull(editForm.audience),
            estimated_views: metricOrNull(editForm.estimated_views),
            domain_authority: metricOrNull(editForm.domain_authority),
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not update clip");
      setEditingId(null);
      await onRefresh();
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Could not update clip");
    } finally {
      onBusy(false);
    }
  }

  async function fetchOgPreview(target: "create" | "edit") {
    const url = (target === "create" ? clipForm.url : editForm.url).trim();
    if (!url) {
      onMessage("Add a URL before fetching a preview");
      return;
    }
    setOgBusy(true);
    try {
      const res = await fetch("/api/pr/coverage/og-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not fetch preview");
      const apply = (form: ClipForm): ClipForm => ({
        ...form,
        title: form.title.trim() || String(data.title ?? ""),
        outlet: form.outlet.trim() || String(data.outlet ?? ""),
        screenshot_url: form.screenshot_url.trim() || String(data.image ?? ""),
      });
      if (target === "create") setClipForm(apply);
      else setEditForm(apply);
      if (!data.image && !data.title) {
        onMessage("No Open Graph preview found for that URL");
      }
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Could not fetch preview");
    } finally {
      setOgBusy(false);
    }
  }

  function renderMetricFields(
    form: ClipForm,
    setForm: (updater: (current: ClipForm) => ClipForm) => void
  ) {
    return (
      <>
        <label className="block text-sm">
          <span className="text-muted">Channel</span>
          <select
            className="mt-1 w-full rounded-md border border-brand/15 px-3 py-2"
            value={form.channel}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                channel: e.target.value as PrCoverageChannel,
              }))
            }
          >
            <option value="">Auto from URL</option>
            {PR_COVERAGE_CHANNELS.filter(Boolean).map((channel) => (
              <option key={channel} value={channel}>
                {channel === "linkedin"
                  ? "LinkedIn"
                  : channel.charAt(0).toUpperCase() + channel.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ["audience", "Audience"],
              ["estimated_views", "Est. views"],
              ["domain_authority", "Domain authority"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block text-sm">
              <span className="text-muted">{label}</span>
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-md border border-brand/15 px-3 py-2"
                value={form[key]}
                onChange={(e) =>
                  setForm((f) => ({ ...f, [key]: e.target.value }))
                }
              />
            </label>
          ))}
        </div>
        <div className="space-y-2">
          <AssetUploadField
            label="Screenshot"
            hint="Upload a page screenshot or paste an image URL for coverage books."
            value={form.screenshot_url}
            onChange={(url) =>
              setForm((f) => ({ ...f, screenshot_url: url }))
            }
          />
        </div>
      </>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="surface-card space-y-3 p-4">
        <h2 className="font-display text-lg text-brand">Log coverage</h2>
        {(
          [
            ["title", "Title"],
            ["url", "URL"],
            ["outlet", "Outlet"],
            ["published_at", "Published date"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="block text-sm">
            <span className="text-muted">{label}</span>
            <input
              type={key === "published_at" ? "date" : "text"}
              className="mt-1 w-full rounded-md border border-brand/15 px-3 py-2"
              value={clipForm[key]}
              onChange={(e) =>
                setClipForm((f) => ({ ...f, [key]: e.target.value }))
              }
            />
          </label>
        ))}
        <button
          type="button"
          disabled={ogBusy || !clipForm.url.trim()}
          onClick={() => void fetchOgPreview("create")}
          className="rounded-lg border border-brand/20 px-3 py-1.5 text-sm text-brand hover:bg-mist disabled:opacity-50"
        >
          {ogBusy ? "Fetching preview…" : "Fetch OG preview"}
        </button>
        <label className="block text-sm">
          <span className="text-muted">Sentiment</span>
          <select
            className="mt-1 w-full rounded-md border border-brand/15 px-3 py-2"
            value={clipForm.sentiment}
            onChange={(e) =>
              setClipForm((f) => ({
                ...f,
                sentiment: e.target.value as PrCoverageSentiment,
              }))
            }
          >
            <option value="">Unset</option>
            <option value="positive">Positive</option>
            <option value="neutral">Neutral</option>
            <option value="negative">Negative</option>
          </select>
        </label>
        {renderMetricFields(clipForm, setClipForm)}
        <textarea
          className="w-full rounded-md border border-brand/15 px-3 py-2 text-sm"
          aria-label="Coverage notes"
          placeholder="Notes"
          value={clipForm.notes}
          onChange={(e) =>
            setClipForm((f) => ({ ...f, notes: e.target.value }))
          }
        />
        <button
          type="button"
          disabled={busy || !clipForm.title.trim()}
          onClick={() => void createClip()}
          className="rounded-lg bg-brand px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          Save clip
        </button>
      </div>
      <div className="space-y-3">
        <div className="flex justify-end">
          <button
            type="button"
            disabled={coverage.length === 0}
            onClick={() =>
              downloadTextFile(
                "coverage.csv",
                coverageToCsv(coverage),
                "text/csv;charset=utf-8"
              )
            }
            className="rounded-lg bg-mist px-3 py-1.5 text-sm text-brand disabled:opacity-50"
          >
            Export coverage
          </button>
        </div>
        <ul className="space-y-2">
          {coverage.length === 0 ? (
            <EmptyState
              title="No coverage yet"
              description="Log clippings manually or promote items from Monitoring."
            />
          ) : (
            coverage.map((c) => (
              <li key={c.id} className="surface-card p-4 text-sm">
                {editingId === c.id ? (
                  <div className="space-y-3">
                    {(
                      [
                        ["title", "Title"],
                        ["url", "URL"],
                        ["outlet", "Outlet"],
                        ["published_at", "Published date"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="block text-sm">
                        <span className="text-muted">{label}</span>
                        <input
                          type={key === "published_at" ? "date" : "text"}
                          className="mt-1 w-full rounded-md border border-brand/15 px-3 py-2"
                          value={editForm[key]}
                          onChange={(e) =>
                            setEditForm((f) => ({
                              ...f,
                              [key]: e.target.value,
                            }))
                          }
                        />
                      </label>
                    ))}
                    <button
                      type="button"
                      disabled={ogBusy || !editForm.url.trim()}
                      onClick={() => void fetchOgPreview("edit")}
                      className="rounded-lg border border-brand/20 px-3 py-1.5 text-sm text-brand hover:bg-mist disabled:opacity-50"
                    >
                      {ogBusy ? "Fetching preview…" : "Fetch OG preview"}
                    </button>
                    {renderMetricFields(editForm, setEditForm)}
                    <textarea
                      className="w-full rounded-md border border-brand/15 px-3 py-2 text-sm"
                      aria-label="Coverage notes"
                      value={editForm.notes}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, notes: e.target.value }))
                      }
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void saveEdit()}
                        className="rounded-lg bg-brand px-3 py-2 text-sm text-white disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-lg border border-brand/20 px-3 py-2 text-sm text-brand"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-3">
                      {c.screenshot_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={c.screenshot_url}
                          alt=""
                          className="h-16 w-12 shrink-0 rounded object-cover"
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-brand">{c.title}</div>
                        <div className="text-muted">
                          {c.outlet}
                          {c.published_at
                            ? ` · ${c.published_at.slice(0, 10)}`
                            : ""}
                          {c.sentiment ? ` · ${c.sentiment}` : ""}
                          {c.channel ? ` · ${c.channel}` : ""}
                        </div>
                        {(c.audience != null ||
                          c.estimated_views != null ||
                          c.domain_authority != null) && (
                          <div className="mt-1 text-xs text-muted">
                            {c.audience != null
                              ? `Audience ${c.audience.toLocaleString()}`
                              : null}
                            {c.estimated_views != null
                              ? `${c.audience != null ? " · " : ""}Views ${c.estimated_views.toLocaleString()}`
                              : null}
                            {c.domain_authority != null
                              ? `${c.audience != null || c.estimated_views != null ? " · " : ""}DA ${c.domain_authority}`
                              : null}
                          </div>
                        )}
                        {c.url ? (
                          <a
                            href={c.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-accent underline"
                          >
                            Open article
                          </a>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-end gap-3">
                      <label className="block text-xs text-muted">
                        Sentiment
                        <select
                          className="mt-1 block w-full max-w-xs rounded-md border border-brand/15 px-2 py-1 text-sm text-brand"
                          value={c.sentiment}
                          onChange={(e) =>
                            void updateCoverageSentiment(
                              c.id,
                              e.target.value as PrCoverageSentiment
                            )
                          }
                        >
                          <option value="">Unset</option>
                          <option value="positive">Positive</option>
                          <option value="neutral">Neutral</option>
                          <option value="negative">Negative</option>
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() => startEdit(c)}
                        className="rounded-lg border border-brand/20 px-3 py-1.5 text-sm text-brand hover:bg-mist"
                      >
                        Edit metrics
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
