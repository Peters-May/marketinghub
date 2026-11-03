"use client";

import { useMemo, useState } from "react";
import type {
  PrCoverage,
  PrCoverageChannel,
  PrCoverageReport,
  PrCoverageReportItem,
} from "@/lib/types";
import { EmptyState } from "@/components/ui/PageHeader";
import { AssetUploadField } from "@/components/content/AssetUploadField";
import { CoverageBookView } from "@/components/pr/CoverageBookView";
import {
  coverageReportSharePath,
} from "@/lib/pr/coverage-report";
import { PR_COVERAGE_CHANNELS } from "@/lib/pr/coverage-channel";
import { matchesSearch } from "@/components/ui/FilterBar";

function metricInput(value: number | null): string {
  return value == null ? "" : String(value);
}

function parseMetric(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function CoverageReportsPanel({
  coverage,
  initialReports,
  busy,
  onBusy,
  onMessage,
}: {
  coverage: PrCoverage[];
  initialReports: PrCoverageReport[];
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onMessage: (message: string) => void;
}) {
  const [reports, setReports] = useState(initialReports);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialReports[0]?.id ?? null
  );
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [clipSearch, setClipSearch] = useState("");
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>([]);
  const [sharePath, setSharePath] = useState("");

  const selected = useMemo(
    () => reports.find((r) => r.id === selectedId) ?? null,
    [reports, selectedId]
  );

  const availableClips = useMemo(() => {
    const inReport = new Set(selected?.items.map((i) => i.coverage_id) ?? []);
    return coverage.filter((clip) => {
      if (inReport.has(clip.id)) return false;
      return matchesSearch(clipSearch, [clip.title, clip.outlet, clip.url]);
    });
  }, [coverage, clipSearch, selected]);

  function rememberReport(next: PrCoverageReport) {
    setReports((prev) => {
      const without = prev.filter((r) => r.id !== next.id);
      return [next, ...without];
    });
    setSelectedId(next.id);
    if (next.share_enabled && next.share_token) {
      setSharePath(coverageReportSharePath(next.share_token));
    } else if (selectedId === next.id) {
      // keep existing path when toggling off so copy still works after re-enable
    }
  }

  async function createReport() {
    onBusy(true);
    try {
      const res = await fetch("/api/pr/coverage-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || "Untitled coverage report",
          summary,
          coverage_ids: selectedClipIds,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not create report");
      rememberReport(data.item as PrCoverageReport);
      setTitle("");
      setSummary("");
      setSelectedClipIds([]);
      onMessage("Coverage report created.");
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Could not create report");
    } finally {
      onBusy(false);
    }
  }

  async function saveMeta() {
    if (!selected) return;
    onBusy(true);
    try {
      const res = await fetch("/api/pr/coverage-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: selected.id,
          patch: { title: selected.title, summary: selected.summary },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save report");
      rememberReport(data.item as PrCoverageReport);
      onMessage("Report saved.");
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Could not save report");
    } finally {
      onBusy(false);
    }
  }

  async function addSelectedClips() {
    if (!selected || selectedClipIds.length === 0) return;
    onBusy(true);
    try {
      const res = await fetch("/api/pr/coverage-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_items",
          id: selected.id,
          coverage_ids: selectedClipIds,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not add clips");
      rememberReport(data.item as PrCoverageReport);
      setSelectedClipIds([]);
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Could not add clips");
    } finally {
      onBusy(false);
    }
  }

  async function removeItem(coverageId: string) {
    if (!selected) return;
    onBusy(true);
    try {
      const res = await fetch("/api/pr/coverage-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "remove_item",
          id: selected.id,
          coverage_id: coverageId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not remove clip");
      rememberReport(data.item as PrCoverageReport);
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Could not remove clip");
    } finally {
      onBusy(false);
    }
  }

  async function moveItem(coverageId: string, direction: -1 | 1) {
    if (!selected) return;
    const ids = selected.items
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((item) => item.coverage_id);
    const index = ids.indexOf(coverageId);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= ids.length) return;
    const reordered = [...ids];
    const [row] = reordered.splice(index, 1);
    reordered.splice(next, 0, row);
    onBusy(true);
    try {
      const res = await fetch("/api/pr/coverage-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reorder",
          id: selected.id,
          coverage_ids: reordered,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not reorder");
      rememberReport(data.item as PrCoverageReport);
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Could not reorder");
    } finally {
      onBusy(false);
    }
  }

  async function refreshItem(coverageId: string) {
    if (!selected) return;
    onBusy(true);
    try {
      const res = await fetch("/api/pr/coverage-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "refresh_item",
          id: selected.id,
          coverage_id: coverageId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not refresh clip");
      rememberReport(data.item as PrCoverageReport);
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Could not refresh clip");
    } finally {
      onBusy(false);
    }
  }

  async function updateItem(
    coverageId: string,
    patch: Partial<PrCoverageReportItem>
  ) {
    if (!selected) return;
    onBusy(true);
    try {
      const res = await fetch("/api/pr/coverage-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_item",
          id: selected.id,
          coverage_id: coverageId,
          patch,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not update clip");
      rememberReport(data.item as PrCoverageReport);
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Could not update clip");
    } finally {
      onBusy(false);
    }
  }

  async function setShare(enabled: boolean) {
    if (!selected) return;
    onBusy(true);
    try {
      const res = await fetch("/api/pr/coverage-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_share",
          id: selected.id,
          enabled,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not update share link");
      const path = String(data.path ?? "");
      setSharePath(path);
      setReports((prev) =>
        prev.map((r) =>
          r.id === selected.id
            ? {
                ...r,
                share_enabled: data.share_enabled === true,
                share_token: String(data.share_token ?? r.share_token),
                status:
                  data.share_enabled === true ? "published" : r.status,
              }
            : r
        )
      );
      if (enabled && path) {
        const url = `${window.location.origin}${path}`;
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          window.prompt("Copy this link:", url);
        }
        onMessage("Public coverage book link copied.");
      } else {
        onMessage("Public link turned off.");
      }
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Could not update share link");
    } finally {
      onBusy(false);
    }
  }

  async function deleteReport(id: string) {
    if (!confirm("Delete this coverage report?")) return;
    onBusy(true);
    try {
      const res = await fetch("/api/pr/coverage-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not delete report");
      }
      setReports((prev) => prev.filter((r) => r.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setSharePath("");
      }
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Could not delete report");
    } finally {
      onBusy(false);
    }
  }

  function openReport(report: PrCoverageReport) {
    setSelectedId(report.id);
    setSharePath(
      report.share_enabled && report.share_token
        ? coverageReportSharePath(report.share_token)
        : report.share_token
          ? coverageReportSharePath(report.share_token)
          : ""
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
      <div className="space-y-4">
        <div className="surface-card space-y-3 p-4">
          <h2 className="font-display text-lg text-brand">New coverage book</h2>
          <label className="block text-sm">
            <span className="text-muted">Title</span>
            <input
              className="mt-1 w-full rounded-md border border-brand/15 px-3 py-2"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Campaign headline"
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted">Summary</span>
            <textarea
              className="mt-1 w-full rounded-md border border-brand/15 px-3 py-2"
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </label>
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-brand/10 p-2">
            {coverage.length === 0 ? (
              <p className="text-sm text-muted">
                Log coverage clips first, then add them here.
              </p>
            ) : (
              coverage.map((clip) => (
                <label
                  key={clip.id}
                  className="flex items-start gap-2 rounded px-1 py-1 text-sm hover:bg-mist"
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selectedClipIds.includes(clip.id)}
                    onChange={(e) => {
                      setSelectedClipIds((prev) =>
                        e.target.checked
                          ? [...prev, clip.id]
                          : prev.filter((id) => id !== clip.id)
                      );
                    }}
                  />
                  <span>
                    <span className="font-medium text-brand">{clip.title}</span>
                    <span className="block text-xs text-muted">
                      {clip.outlet || "No outlet"}
                    </span>
                  </span>
                </label>
              ))
            )}
          </div>
          <button
            type="button"
            disabled={busy || !title.trim()}
            onClick={() => void createReport()}
            className="rounded-lg bg-brand px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            Create report
          </button>
        </div>

        <div className="surface-card p-4">
          <h3 className="font-display text-base text-brand">Reports</h3>
          <ul className="mt-3 space-y-2">
            {reports.length === 0 ? (
              <EmptyState
                title="No coverage books yet"
                description="Create a report from logged coverage clips."
              />
            ) : (
              reports.map((report) => (
                <li key={report.id}>
                  <button
                    type="button"
                    onClick={() => openReport(report)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                      selectedId === report.id
                        ? "border-accent bg-mist"
                        : "border-brand/10 hover:bg-mist"
                    }`}
                  >
                    <div className="font-medium text-brand">{report.title}</div>
                    <div className="text-xs text-muted">
                      {report.items.length} clips · {report.status}
                      {report.share_enabled ? " · shared" : ""}
                    </div>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      <div className="space-y-4">
        {!selected ? (
          <EmptyState
            title="Select a coverage book"
            description="Create a report or open one from the list."
          />
        ) : (
          <>
            <div className="surface-card space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-3">
                  <label className="block text-sm">
                    <span className="text-muted">Title</span>
                    <input
                      className="mt-1 w-full rounded-md border border-brand/15 px-3 py-2"
                      value={selected.title}
                      onChange={(e) =>
                        setReports((prev) =>
                          prev.map((r) =>
                            r.id === selected.id
                              ? { ...r, title: e.target.value }
                              : r
                          )
                        )
                      }
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-muted">Summary</span>
                    <textarea
                      className="mt-1 w-full rounded-md border border-brand/15 px-3 py-2"
                      rows={2}
                      value={selected.summary}
                      onChange={(e) =>
                        setReports((prev) =>
                          prev.map((r) =>
                            r.id === selected.id
                              ? { ...r, summary: e.target.value }
                              : r
                          )
                        )
                      }
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveMeta()}
                    className="rounded-lg bg-brand px-3 py-2 text-sm text-white disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void setShare(!selected.share_enabled)}
                    className="rounded-lg border border-brand/20 px-3 py-2 text-sm text-brand hover:bg-mist disabled:opacity-50"
                  >
                    {selected.share_enabled
                      ? "Copy / refresh link"
                      : "Enable share link"}
                  </button>
                  {selected.share_enabled ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void setShare(false)}
                      className="rounded-lg border border-brand/20 px-3 py-2 text-sm text-brand hover:bg-mist disabled:opacity-50"
                    >
                      Turn off link
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void deleteReport(selected.id)}
                    className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
              {sharePath ? (
                <p className="break-all text-xs text-muted">
                  Public path: {sharePath}
                </p>
              ) : null}
            </div>

            <div className="surface-card space-y-3 p-4">
              <h3 className="font-display text-base text-brand">Add clips</h3>
              <input
                className="w-full rounded-md border border-brand/15 px-3 py-2 text-sm"
                placeholder="Search coverage…"
                value={clipSearch}
                onChange={(e) => setClipSearch(e.target.value)}
              />
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {availableClips.length === 0 ? (
                  <p className="text-sm text-muted">No matching clips to add.</p>
                ) : (
                  availableClips.map((clip) => (
                    <label
                      key={clip.id}
                      className="flex items-start gap-2 rounded px-1 py-1 text-sm hover:bg-mist"
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={selectedClipIds.includes(clip.id)}
                        onChange={(e) => {
                          setSelectedClipIds((prev) =>
                            e.target.checked
                              ? [...prev, clip.id]
                              : prev.filter((id) => id !== clip.id)
                          );
                        }}
                      />
                      <span>
                        <span className="font-medium text-brand">
                          {clip.title}
                        </span>
                        <span className="block text-xs text-muted">
                          {clip.outlet || "No outlet"}
                        </span>
                      </span>
                    </label>
                  ))
                )}
              </div>
              <button
                type="button"
                disabled={busy || selectedClipIds.length === 0}
                onClick={() => void addSelectedClips()}
                className="rounded-lg bg-mist px-3 py-2 text-sm text-brand disabled:opacity-50"
              >
                Add selected
              </button>
            </div>

            <div className="space-y-3">
              {selected.items
                .slice()
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((item) => (
                  <div key={item.coverage_id} className="surface-card space-y-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-brand">{item.title}</div>
                        <div className="text-xs text-muted">
                          {item.outlet || "No outlet"}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void moveItem(item.coverage_id, -1)}
                          className="rounded border border-brand/15 px-2 py-1 text-xs"
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void moveItem(item.coverage_id, 1)}
                          className="rounded border border-brand/15 px-2 py-1 text-xs"
                        >
                          Down
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void refreshItem(item.coverage_id)}
                          className="rounded border border-brand/15 px-2 py-1 text-xs"
                        >
                          Refresh from coverage
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void removeItem(item.coverage_id)}
                          className="rounded border border-red-200 px-2 py-1 text-xs text-red-700"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="block text-sm">
                        <span className="text-muted">Channel</span>
                        <select
                          className="mt-1 w-full rounded-md border border-brand/15 px-3 py-2"
                          value={item.channel}
                          onChange={(e) =>
                            void updateItem(item.coverage_id, {
                              channel: e.target.value as PrCoverageChannel,
                            })
                          }
                        >
                          {PR_COVERAGE_CHANNELS.filter(Boolean).map((channel) => (
                            <option key={channel} value={channel}>
                              {channel === "linkedin"
                                ? "LinkedIn"
                                : channel.charAt(0).toUpperCase() +
                                  channel.slice(1)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {(
                          [
                            ["audience", "Audience"],
                            ["estimated_views", "Views"],
                            ["domain_authority", "DA"],
                          ] as const
                        ).map(([key, label]) => (
                          <label key={key} className="block text-sm">
                            <span className="text-muted">{label}</span>
                            <input
                              type="number"
                              min={0}
                              className="mt-1 w-full rounded-md border border-brand/15 px-2 py-2"
                              defaultValue={metricInput(item[key])}
                              onBlur={(e) =>
                                void updateItem(item.coverage_id, {
                                  [key]: parseMetric(e.target.value),
                                })
                              }
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                    <AssetUploadField
                      label="Screenshot"
                      value={item.screenshot_url}
                      onChange={(url) =>
                        void updateItem(item.coverage_id, {
                          screenshot_url: url,
                        })
                      }
                    />
                  </div>
                ))}
            </div>

            <div className="overflow-hidden rounded-xl border border-brand/10">
              <div className="border-b border-brand/10 bg-mist px-4 py-2 text-xs uppercase tracking-wide text-muted">
                Live preview
              </div>
              <CoverageBookView report={selected} compact />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
