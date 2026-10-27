"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import type { EmailCampaign } from "@/lib/types";
import { isMarketingInboxCampaign } from "@/lib/email/category";
import { CopyEmailButton } from "@/components/email/CopyEmailButton";
import { CreateEmailDialog } from "@/components/email/CreateEmailDialog";
import { EmptyState } from "@/components/ui/PageHeader";
import { cn } from "@/lib/utils";
import {
  campaignClickRateLabel,
  campaignOpenHref,
  campaignOpenRateLabel,
  campaignUpdatedBy,
  canDeleteUnsentDraft,
  formatLondonUpdated,
} from "@/lib/email/display";

type StatusFilter = "all" | "draft" | "scheduled" | "sent";

const FILTERS: { id: StatusFilter; label: string; dot: string }[] = [
  { id: "all", label: "All emails", dot: "bg-slate-400" },
  { id: "draft", label: "Drafts", dot: "bg-slate-300" },
  { id: "scheduled", label: "Scheduled", dot: "bg-amber-400" },
  { id: "sent", label: "Sent", dot: "bg-emerald-500" },
];

function matchesFilter(status: EmailCampaign["status"], filter: StatusFilter) {
  if (filter === "all") return true;
  if (filter === "draft") return status === "draft";
  if (filter === "scheduled") return status === "scheduled" || status === "sending";
  return status === "sent";
}

function statusDot(status: EmailCampaign["status"]) {
  if (status === "sent") return "bg-emerald-500";
  if (status === "scheduled" || status === "sending") return "bg-amber-400";
  if (status === "failed") return "bg-red-500";
  return "bg-slate-300";
}

export function EmailCampaignsPanel({
  campaigns,
  onOpenAudiences,
}: {
  campaigns: EmailCampaign[];
  onOpenAudiences: () => void;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [items, setItems] = useState(campaigns);

  useEffect(() => {
    setItems(campaigns);
  }, [campaigns]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...items]
      .filter((c) => isMarketingInboxCampaign(c))
      .filter((c) => matchesFilter(c.status, filter))
      .filter((c) => {
        if (!q) return true;
        return (
          c.title.toLowerCase().includes(q) ||
          c.subject.toLowerCase().includes(q)
        );
      })
      .sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
  }, [items, filter, query]);

  async function removeDraft(campaign: EmailCampaign) {
    if (!canDeleteUnsentDraft(campaign) || deletingId) return;
    if (!window.confirm("Delete this draft? It has not been sent.")) return;
    setDeletingId(campaign.id);
    setError("");
    const previous = items;
    setItems((current) => current.filter((item) => item.id !== campaign.id));
    try {
      const res = await fetch("/api/email/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: campaign.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not delete this email");
      router.refresh();
    } catch (err) {
      setItems(previous);
      setError(err instanceof Error ? err.message : "Could not delete this email");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onOpenAudiences}>
          Audiences
        </button>
        <button
          type="button"
          className="btn-primary inline-flex items-center gap-1.5"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Create email
        </button>
      </div>

      <CreateEmailDialog open={createOpen} onClose={() => setCreateOpen(false)} />

      {error ? (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm",
              filter === item.id
                ? "border-brand bg-white text-brand"
                : "border-border bg-white text-muted hover:text-foreground"
            )}
            onClick={() => setFilter(item.id)}
          >
            <span className={cn("h-2 w-2 rounded-full", item.dot)} />
            {item.label}
          </button>
        ))}
      </div>

      <div className="relative mb-3 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          className="input w-full pl-9"
          placeholder="Search email name or subject line"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="No emails yet"
          description="Create an email, choose who it goes to, then preview and schedule it."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No emails in this view"
          description="Try another status, or clear the search."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-white">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-border text-xs text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Email name</th>
                <th className="px-3 py-3 font-medium">Delivered</th>
                <th className="px-3 py-3 font-medium">Open rate</th>
                <th className="px-3 py-3 font-medium">Click rate</th>
                <th className="px-3 py-3 font-medium">Last updated</th>
                <th className="px-3 py-3 font-medium">Last updated by</th>
                <th className="px-3 py-3 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const updated = formatLondonUpdated(c.updated_at);
                const href = campaignOpenHref(c);
                return (
                  <tr
                    key={c.id}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-slate-50"
                    onClick={() => router.push(href)}
                  >
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 text-left font-medium text-brand hover:underline"
                        onClick={() => router.push(href)}
                      >
                        <span className={cn("h-2 w-2 shrink-0 rounded-full", statusDot(c.status))} />
                        {c.title}
                      </button>
                    </td>
                    <td className="px-3 py-3 tabular-nums">{c.stats.delivered}</td>
                    <td className="px-3 py-3 tabular-nums">{campaignOpenRateLabel(c)}</td>
                    <td className="px-3 py-3 tabular-nums">{campaignClickRateLabel(c)}</td>
                    <td className="px-3 py-3">
                      <div>{updated.date}</div>
                      <div className="text-xs text-muted">{updated.time}</div>
                    </td>
                    <td className="px-3 py-3">{campaignUpdatedBy(c)}</td>
                    <td className="px-3 py-3 text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        <CopyEmailButton kind="campaign" id={c.id} />
                        {canDeleteUnsentDraft(c) ? (
                          <button
                            type="button"
                            className="btn-secondary px-2.5 py-1 text-xs text-red-700"
                            disabled={deletingId === c.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              void removeDraft(c);
                            }}
                          >
                            {deletingId === c.id ? "Deleting…" : "Delete"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
