"use client";

import { useCallback, useEffect, useState } from "react";
import type { EmailCampaign } from "@/lib/types";
import { EmptyState } from "@/components/ui/PageHeader";
import { StatusPill } from "@/components/ui/StatusPill";

type ReportCampaign = {
  id: string;
  title: string;
  status: EmailCampaign["status"];
  sent_at: string | null;
  scheduled_at: string | null;
  stats: EmailCampaign["stats"];
  open_rate: number | null;
  click_rate: number | null;
};

type Rollup = {
  campaigns: number;
  recipients: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  unsubscribed: number;
};

const STATUS_LABEL: Record<EmailCampaign["status"], string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function EmailReportsPanel(_props: { campaigns: EmailCampaign[] }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rollup, setRollup] = useState<Rollup | null>(null);
  const [rows, setRows] = useState<ReportCampaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      if (from) qs.set("from", new Date(from).toISOString());
      if (to) qs.set("to", new Date(to).toISOString());
      const res = await fetch(`/api/email/reports?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load reports");
      setRollup(data.rollup ?? null);
      setRows(data.campaigns ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="text-muted">From</span>
          <input
            type="date"
            className="input mt-1 block"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="text-muted">To</span>
          <input
            type="date"
            className="input mt-1 block"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn-secondary"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading ? "Loading…" : "Apply"}
        </button>
      </div>

      {error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : null}

      {rollup ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">
          {(
            [
              ["Campaigns", rollup.campaigns],
              ["Recipients", rollup.recipients],
              ["Delivered", rollup.delivered],
              ["Opened", rollup.opened],
              ["Clicked", rollup.clicked],
              ["Bounced", rollup.bounced],
              ["Complaints", rollup.complained],
              ["Unsubscribes", rollup.unsubscribed],
            ] as const
          ).map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl border border-border bg-white px-4 py-3"
            >
              <div className="text-2xl font-medium text-brand">{value}</div>
              <div className="text-xs text-muted">{label}</div>
            </div>
          ))}
        </div>
      ) : null}

      {rows.length === 0 && !loading ? (
        <EmptyState
          title="No campaign stats in this period"
          description="Send a campaign to start collecting opens, clicks, and bounces via Resend webhooks."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Campaign</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Recipients</th>
                <th className="px-3 py-2 font-medium">Delivered</th>
                <th className="px-3 py-2 font-medium">Open %</th>
                <th className="px-3 py-2 font-medium">Click %</th>
                <th className="px-3 py-2 font-medium">Bounces</th>
                <th className="px-3 py-2 font-medium">Unsubs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-medium text-brand">{r.title}</td>
                  <td className="px-3 py-2">
                    <StatusPill
                      status={r.status}
                      label={STATUS_LABEL[r.status]}
                    />
                  </td>
                  <td className="px-3 py-2">{r.stats.recipients}</td>
                  <td className="px-3 py-2">{r.stats.delivered}</td>
                  <td className="px-3 py-2">
                    {r.open_rate !== null ? `${r.open_rate}%` : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {r.click_rate !== null ? `${r.click_rate}%` : "—"}
                  </td>
                  <td className="px-3 py-2">{r.stats.bounced}</td>
                  <td className="px-3 py-2">{r.stats.unsubscribed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
