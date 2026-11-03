"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  PrCoverageSentiment,
  PrMonitorMention,
  PrMonitorMentionStatus,
  PrMonitorQuery,
  PrMonitorSettings,
} from "@/lib/types";
import { mentionsToCsv } from "@/lib/pr/mentions-csv";
import { mentionMatchNote } from "@/lib/pr/mention-match";
import { summarizeMentions } from "@/lib/pr/monitor-summary";
import { HighlightedKeywords } from "@/components/pr/HighlightedKeywords";
import { downloadTextFile } from "@/lib/pr/pitch-eml";
import { EmptyState } from "@/components/ui/PageHeader";

type Props = {
  queries: PrMonitorQuery[];
  mentions: PrMonitorMention[];
  settings: PrMonitorSettings;
  newsApiConfigured: boolean;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onMessage: (message: string) => void;
  onRefresh: () => Promise<void>;
  onPromoted: () => void;
};

const SENTIMENT_OPTIONS: { value: PrCoverageSentiment; label: string }[] = [
  { value: "", label: "Unset" },
  { value: "positive", label: "Positive" },
  { value: "neutral", label: "Neutral" },
  { value: "negative", label: "Negative" },
];

function sentimentClass(sentiment: PrCoverageSentiment) {
  if (sentiment === "positive") return "bg-emerald-50 text-emerald-800";
  if (sentiment === "negative") return "bg-amber-50 text-amber-900";
  if (sentiment === "neutral") return "bg-mist text-brand";
  return "bg-white text-muted border border-brand/10";
}

export function MonitoringPanel({
  queries,
  mentions,
  settings,
  newsApiConfigured,
  busy,
  onBusy,
  onMessage,
  onRefresh,
  onPromoted,
}: Props) {
  const [queryForm, setQueryForm] = useState({
    name: "",
    keywords: "Peters & May",
    exclusions: "",
    languages: "",
  });
  const [editingQueryId, setEditingQueryId] = useState<string | null>(null);
  const [editQuery, setEditQuery] = useState({
    name: "",
    keywords: "",
    exclusions: "",
    languages: "",
  });
  const [manualForm, setManualForm] = useState({
    title: "",
    url: "",
    outlet: "",
    published_at: "",
    snippet: "",
    sentiment: "" as PrCoverageSentiment,
    country: "",
    language: "",
    query_id: "",
  });
  const [digestEmails, setDigestEmails] = useState(settings.digest_emails);
  useEffect(() => {
    setDigestEmails(settings.digest_emails);
  }, [settings.digest_emails]);
  const [importText, setImportText] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    PrMonitorMentionStatus | "all"
  >("new");
  const [sentimentFilter, setSentimentFilter] = useState<
    PrCoverageSentiment | "all"
  >("all");
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [outletFilter, setOutletFilter] = useState("");
  const [queryFilter, setQueryFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [keywordSearch, setKeywordSearch] = useState("");

  const summary = useMemo(() => summarizeMentions(mentions), [mentions]);

  const outlets = useMemo(() => {
    const set = new Set(
      mentions.map((m) => m.outlet.trim()).filter(Boolean)
    );
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [mentions]);

  const filtered = useMemo(() => {
    const q = keywordSearch.trim().toLowerCase();
    return mentions.filter((m) => {
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (sentimentFilter !== "all" && m.sentiment !== sentimentFilter) {
        return false;
      }
      if (favoriteOnly && !m.favorite) return false;
      if (outletFilter && m.outlet !== outletFilter) return false;
      if (queryFilter && m.query_id !== queryFilter) return false;
      if (dateFrom) {
        const day = (m.published_at || m.created_at).slice(0, 10);
        if (day < dateFrom) return false;
      }
      if (dateTo) {
        const day = (m.published_at || m.created_at).slice(0, 10);
        if (day > dateTo) return false;
      }
      if (q) {
        const hay = `${m.title} ${m.snippet} ${m.outlet}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    mentions,
    statusFilter,
    sentimentFilter,
    favoriteOnly,
    outletFilter,
    queryFilter,
    dateFrom,
    dateTo,
    keywordSearch,
  ]);

  async function createQuery() {
    onBusy(true);
    try {
      const res = await fetch("/api/pr/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_query", ...queryForm }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save the search");
      setQueryForm({
        name: "",
        keywords: "Peters & May",
        exclusions: "",
        languages: "",
      });
      await onRefresh();
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Could not save the search");
    } finally {
      onBusy(false);
    }
  }

  async function runQuery(id: string) {
    onBusy(true);
    onMessage("");
    try {
      const res = await fetch("/api/pr/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_query", id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Run failed");
      await onRefresh();
      if (!data.news_api_configured) {
        onMessage(
          "No NEWS_API_KEY configured — add it to env to fetch live mentions. Coverage can still be logged manually."
        );
      } else {
        onMessage(`Added ${data.added} new mention(s).`);
      }
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Run failed");
    } finally {
      onBusy(false);
    }
  }

  async function toggleActive(query: PrMonitorQuery) {
    onBusy(true);
    try {
      const res = await fetch("/api/pr/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_query",
          id: query.id,
          patch: { active: !query.active },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not update query");
      }
      await onRefresh();
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Could not update query");
    } finally {
      onBusy(false);
    }
  }

  async function deleteQuery(id: string) {
    if (!window.confirm("Delete this monitoring query?")) return;
    onBusy(true);
    try {
      const res = await fetch("/api/pr/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_query", id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not delete query");
      }
      await onRefresh();
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Could not delete query");
    } finally {
      onBusy(false);
    }
  }

  async function saveEditQuery() {
    if (!editingQueryId) return;
    onBusy(true);
    try {
      const res = await fetch("/api/pr/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_query",
          id: editingQueryId,
          patch: editQuery,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not save query");
      }
      setEditingQueryId(null);
      await onRefresh();
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Could not save query");
    } finally {
      onBusy(false);
    }
  }

  async function promoteMention(id: string, sentiment: PrCoverageSentiment) {
    const res = await fetch("/api/pr/monitor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "promote_mention", id, sentiment }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      onMessage(data.error || "Could not log that mention as coverage");
      return;
    }
    await onRefresh();
    onPromoted();
  }

  async function dismissMention(id: string) {
    const res = await fetch("/api/pr/monitor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismiss_mention", id }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      onMessage(data.error || "Could not dismiss that mention");
      return;
    }
    await onRefresh();
  }

  async function patchMention(
    id: string,
    patch: Partial<{
      sentiment: PrCoverageSentiment;
      favorite: boolean;
    }>
  ) {
    const res = await fetch("/api/pr/monitor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_mention", id, patch }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      onMessage(data.error || "Could not update mention");
      return;
    }
    await onRefresh();
  }

  async function addMention() {
    onBusy(true);
    try {
      const res = await fetch("/api/pr/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_mention",
          ...manualForm,
          published_at: manualForm.published_at || null,
          query_id: manualForm.query_id || queries[0]?.id || "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not add mention");
      setManualForm({
        title: "",
        url: "",
        outlet: "",
        published_at: "",
        snippet: "",
        sentiment: "",
        country: "",
        language: "",
        query_id: "",
      });
      await onRefresh();
      onMessage("Mention added to the inbox.");
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Could not add mention");
    } finally {
      onBusy(false);
    }
  }

  async function importCsv() {
    onBusy(true);
    try {
      const res = await fetch("/api/pr/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "import_mentions",
          csv: importText,
          query_id: queries[0]?.id || "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Import failed");
      setImportText("");
      await onRefresh();
      onMessage(
        `Imported ${data.added} mention(s) (${data.skipped} skipped as duplicates).`
      );
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Import failed");
    } finally {
      onBusy(false);
    }
  }

  async function saveDigest() {
    onBusy(true);
    try {
      const res = await fetch("/api/pr/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_settings",
          patch: { digest_emails: digestEmails },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save settings");
      await onRefresh();
      onMessage("Digest recipients saved.");
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Could not save settings");
    } finally {
      onBusy(false);
    }
  }

  function exportFiltered() {
    const day = new Date().toISOString().slice(0, 10);
    downloadTextFile(
      `mentions-${day}.csv`,
      `\uFEFF${mentionsToCsv(filtered, queries)}`,
      "text/csv;charset=utf-8"
    );
  }

  return (
    <div className="space-y-6">
      {!newsApiConfigured ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-brand">
          Set <code className="font-mono">NEWS_API_KEY</code> in the environment
          to fetch live news. Until then, use Add mention, Owly CSV import, or
          Coverage to log clips by hand.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Mentions", value: summary.total },
          { label: "New", value: summary.newCount },
          { label: "Promoted", value: summary.promotedCount },
          {
            label: "Positive / negative",
            value: `${summary.bySentiment.positive} / ${summary.bySentiment.negative}`,
          },
        ].map((stat) => (
          <div key={stat.label} className="surface-card px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-muted">
              {stat.label}
            </div>
            <div className="mt-1 font-display text-xl text-brand">
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {summary.topOutlets.length > 0 ? (
        <p className="text-sm text-muted">
          Top outlets:{" "}
          {summary.topOutlets
            .map((o) => `${o.outlet} (${o.count})`)
            .join(" · ")}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="surface-card space-y-3 p-4">
          <h2 className="font-display text-lg text-brand">New query</h2>
          <input
            className="w-full rounded-md border border-brand/15 px-3 py-2 text-sm"
            aria-label="Search name"
            placeholder="Name"
            value={queryForm.name}
            onChange={(e) =>
              setQueryForm((f) => ({ ...f, name: e.target.value }))
            }
          />
          <textarea
            className="w-full rounded-md border border-brand/15 px-3 py-2 text-sm"
            aria-label="Keywords"
            placeholder="Keywords (comma-separated)"
            value={queryForm.keywords}
            onChange={(e) =>
              setQueryForm((f) => ({ ...f, keywords: e.target.value }))
            }
          />
          <textarea
            className="w-full rounded-md border border-brand/15 px-3 py-2 text-sm"
            aria-label="Exclusions"
            placeholder="Exclusions (optional)"
            value={queryForm.exclusions}
            onChange={(e) =>
              setQueryForm((f) => ({ ...f, exclusions: e.target.value }))
            }
          />
          <input
            className="w-full rounded-md border border-brand/15 px-3 py-2 text-sm"
            aria-label="Languages"
            placeholder="Languages (optional, e.g. en — leave blank for all)"
            value={queryForm.languages}
            onChange={(e) =>
              setQueryForm((f) => ({ ...f, languages: e.target.value }))
            }
          />
          <button
            type="button"
            disabled={busy || !queryForm.name.trim()}
            onClick={() => void createQuery()}
            className="rounded-lg bg-brand px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            Save query
          </button>
        </div>

        <div className="surface-card space-y-3 p-4">
          <h2 className="font-display text-lg text-brand">Digest settings</h2>
          <p className="text-xs text-muted">
            Daily cron emails these addresses when new mentions are found.
          </p>
          <input
            className="w-full rounded-md border border-brand/15 px-3 py-2 text-sm"
            aria-label="Digest emails"
            placeholder="marketing@petersandmay.com, …"
            value={digestEmails}
            onChange={(e) => setDigestEmails(e.target.value)}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveDigest()}
            className="rounded-lg bg-brand px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            Save recipients
          </button>
        </div>
      </div>

      <ul className="space-y-2">
        {queries.map((q) => (
          <li
            key={q.id}
            className="surface-card space-y-3 p-4"
          >
            {editingQueryId === q.id ? (
              <div className="space-y-2">
                <input
                  className="w-full rounded-md border border-brand/15 px-3 py-2 text-sm"
                  value={editQuery.name}
                  onChange={(e) =>
                    setEditQuery((f) => ({ ...f, name: e.target.value }))
                  }
                  aria-label="Edit query name"
                />
                <textarea
                  className="w-full rounded-md border border-brand/15 px-3 py-2 text-sm"
                  value={editQuery.keywords}
                  onChange={(e) =>
                    setEditQuery((f) => ({ ...f, keywords: e.target.value }))
                  }
                  aria-label="Edit keywords"
                />
                <textarea
                  className="w-full rounded-md border border-brand/15 px-3 py-2 text-sm"
                  value={editQuery.exclusions}
                  onChange={(e) =>
                    setEditQuery((f) => ({ ...f, exclusions: e.target.value }))
                  }
                  aria-label="Edit exclusions"
                />
                <input
                  className="w-full rounded-md border border-brand/15 px-3 py-2 text-sm"
                  value={editQuery.languages}
                  onChange={(e) =>
                    setEditQuery((f) => ({ ...f, languages: e.target.value }))
                  }
                  aria-label="Edit languages"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveEditQuery()}
                    className="rounded-lg bg-brand px-3 py-1.5 text-sm text-white disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingQueryId(null)}
                    className="rounded-lg bg-mist px-3 py-1.5 text-sm text-brand"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-brand">
                    {q.name}
                    {!q.active ? (
                      <span className="ml-2 text-xs font-normal text-muted">
                        (paused)
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted">{q.keywords}</div>
                  {q.last_run_at ? (
                    <div className="text-xs text-muted">
                      Last run {q.last_run_at.slice(0, 16).replace("T", " ")}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void runQuery(q.id)}
                    className="rounded-lg bg-brand px-3 py-1.5 text-sm text-white disabled:opacity-50"
                  >
                    Run now
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void toggleActive(q)}
                    className="rounded-lg bg-mist px-3 py-1.5 text-sm text-brand disabled:opacity-50"
                  >
                    {q.active ? "Pause" : "Activate"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingQueryId(q.id);
                      setEditQuery({
                        name: q.name,
                        keywords: q.keywords,
                        exclusions: q.exclusions,
                        languages: q.languages || "",
                      });
                    }}
                    className="rounded-lg bg-mist px-3 py-1.5 text-sm text-brand"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void deleteQuery(q.id)}
                    className="rounded-lg bg-mist px-3 py-1.5 text-sm text-brand disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="surface-card space-y-3 p-4">
          <h2 className="font-display text-lg text-brand">Add mention</h2>
          {(
            [
              ["title", "Title"],
              ["url", "URL"],
              ["outlet", "Outlet"],
              ["published_at", "Published date"],
              ["country", "Country"],
              ["language", "Language"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block text-sm">
              <span className="text-muted">{label}</span>
              <input
                type={key === "published_at" ? "date" : "text"}
                className="mt-1 w-full rounded-md border border-brand/15 px-3 py-2"
                value={manualForm[key]}
                onChange={(e) =>
                  setManualForm((f) => ({ ...f, [key]: e.target.value }))
                }
              />
            </label>
          ))}
          <label className="block text-sm">
            <span className="text-muted">Snippet</span>
            <textarea
              className="mt-1 w-full rounded-md border border-brand/15 px-3 py-2 text-sm"
              value={manualForm.snippet}
              onChange={(e) =>
                setManualForm((f) => ({ ...f, snippet: e.target.value }))
              }
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted">Sentiment</span>
            <select
              className="mt-1 w-full rounded-md border border-brand/15 px-3 py-2"
              value={manualForm.sentiment}
              onChange={(e) =>
                setManualForm((f) => ({
                  ...f,
                  sentiment: e.target.value as PrCoverageSentiment,
                }))
              }
            >
              {SENTIMENT_OPTIONS.map((o) => (
                <option key={o.value || "unset"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy || !manualForm.title.trim()}
            onClick={() => void addMention()}
            className="rounded-lg bg-brand px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            Add to inbox
          </button>
        </div>

        <div className="surface-card space-y-3 p-4">
          <h2 className="font-display text-lg text-brand">Import Owly CSV</h2>
          <p className="text-xs text-muted">
            Paste an Owly / Prowly export. Rows dedupe on URL.
          </p>
          <textarea
            className="h-40 w-full rounded-md border border-brand/15 px-3 py-2 font-mono text-xs"
            aria-label="Owly CSV"
            placeholder="title,outlet,url,published_at,snippet,sentiment,country"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          <button
            type="button"
            disabled={busy || !importText.trim()}
            onClick={() => void importCsv()}
            className="rounded-lg bg-brand px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            Import mentions
          </button>
        </div>
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg text-brand">
              Found {filtered.length} mention
              {filtered.length === 1 ? "" : "s"}
            </h2>
            <p className="text-xs text-muted">
              Highlighted text is the keyword that brought the article in.
            </p>
          </div>
          <button
            type="button"
            disabled={filtered.length === 0}
            onClick={exportFiltered}
            className="rounded-lg bg-mist px-3 py-1.5 text-sm text-brand disabled:opacity-50"
          >
            Export mentions
          </button>
        </div>

        <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm">
            <span className="text-muted">Status</span>
            <select
              className="mt-1 w-full rounded-md border border-brand/15 px-2 py-1.5"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as PrMonitorMentionStatus | "all")
              }
            >
              <option value="all">All</option>
              <option value="new">New</option>
              <option value="promoted">Promoted</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="text-muted">Sentiment</span>
            <select
              className="mt-1 w-full rounded-md border border-brand/15 px-2 py-1.5"
              value={sentimentFilter}
              onChange={(e) =>
                setSentimentFilter(
                  e.target.value as PrCoverageSentiment | "all"
                )
              }
            >
              <option value="all">All</option>
              {SENTIMENT_OPTIONS.map((o) => (
                <option key={o.value || "unset"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-muted">Outlet</span>
            <select
              className="mt-1 w-full rounded-md border border-brand/15 px-2 py-1.5"
              value={outletFilter}
              onChange={(e) => setOutletFilter(e.target.value)}
            >
              <option value="">All</option>
              {outlets.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-muted">Query</span>
            <select
              className="mt-1 w-full rounded-md border border-brand/15 px-2 py-1.5"
              value={queryFilter}
              onChange={(e) => setQueryFilter(e.target.value)}
            >
              <option value="">All</option>
              {queries.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-muted">From</span>
            <input
              type="date"
              className="mt-1 w-full rounded-md border border-brand/15 px-2 py-1.5"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="text-muted">To</span>
            <input
              type="date"
              className="mt-1 w-full rounded-md border border-brand/15 px-2 py-1.5"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-muted">Search title / snippet</span>
            <input
              className="mt-1 w-full rounded-md border border-brand/15 px-2 py-1.5"
              value={keywordSearch}
              onChange={(e) => setKeywordSearch(e.target.value)}
              placeholder="Narrow mentions by searching specific words"
            />
          </label>
          <label className="flex items-end gap-2 text-sm">
            <input
              type="checkbox"
              checked={favoriteOnly}
              onChange={(e) => setFavoriteOnly(e.target.checked)}
            />
            <span className="text-muted">Favorites only</span>
          </label>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title="No mentions match"
            description="Adjust filters, run a query, import an Owly CSV, or add a mention."
          />
        ) : (
          <ul className="space-y-2">
            {filtered.map((m) => {
              const keywords =
                queries.find((q) => q.id === m.query_id)?.keywords ?? "";
              const matchNote = mentionMatchNote(
                keywords,
                m.title,
                m.snippet
              );
              return (
                <li
                  key={m.id}
                  className="surface-card flex flex-wrap items-start justify-between gap-3 p-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium text-brand">
                        <HighlightedKeywords
                          text={m.title}
                          keywords={keywords}
                        />
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${sentimentClass(m.sentiment)}`}
                      >
                        {m.sentiment || "Unset"}
                      </span>
                      <span className="rounded-full bg-mist px-2 py-0.5 text-xs text-muted">
                        {m.status}
                      </span>
                      {m.favorite ? (
                        <span className="text-xs text-accent">Favorite</span>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted">
                      {m.outlet}
                      {m.published_at
                        ? ` · ${m.published_at.slice(0, 10)}`
                        : ""}
                      {m.country ? ` · ${m.country}` : ""}
                      {m.source !== "newsapi" ? ` · ${m.source}` : ""}
                    </div>
                    {m.snippet ? (
                      <p className="mt-1 text-sm text-muted">
                        <HighlightedKeywords
                          text={m.snippet}
                          keywords={keywords}
                        />
                      </p>
                    ) : null}
                    {matchNote ? (
                      <p className="mt-1 text-xs text-brand">{matchNote}</p>
                    ) : null}
                    {m.url ? (
                      <a
                        href={m.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-accent underline"
                      >
                        Open article
                      </a>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-2">
                    <select
                      className="rounded-md border border-brand/15 px-2 py-1 text-xs"
                      aria-label="Mention sentiment"
                      value={m.sentiment}
                      onChange={(e) =>
                        void patchMention(m.id, {
                          sentiment: e.target.value as PrCoverageSentiment,
                        })
                      }
                    >
                      {SENTIMENT_OPTIONS.map((o) => (
                        <option key={o.value || "unset"} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <div className="flex flex-wrap gap-2">
                      {m.status === "new" ? (
                        <button
                          type="button"
                          onClick={() =>
                            void promoteMention(m.id, m.sentiment)
                          }
                          className="rounded-lg bg-brand px-2 py-1 text-xs text-white"
                        >
                          Promote
                        </button>
                      ) : null}
                      {m.status === "new" ? (
                        <button
                          type="button"
                          onClick={() => void dismissMention(m.id)}
                          className="rounded-lg bg-mist px-2 py-1 text-xs text-brand"
                        >
                          Dismiss
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() =>
                          void patchMention(m.id, {
                            favorite: !m.favorite,
                          })
                        }
                        className="rounded-lg bg-mist px-2 py-1 text-xs text-brand"
                      >
                        {m.favorite ? "Unfavorite" : "Favorite"}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
