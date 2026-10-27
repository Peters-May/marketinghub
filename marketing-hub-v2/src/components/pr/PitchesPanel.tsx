"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ContentItem, EmailCampaign } from "@/lib/types";
import { CreateEmailDialog } from "@/components/email/CreateEmailDialog";
import { StatusPill } from "@/components/ui/StatusPill";
import { isPitchTabCampaign } from "@/lib/email/category";
import {
  campaignClickRateLabel,
  campaignMetaLine,
  campaignOpenHref,
  campaignOpenRateLabel,
} from "@/lib/email/display";

const STATUS_LABEL: Record<EmailCampaign["status"], string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function PitchesPanel({
  campaigns,
  content,
  match = isPitchTabCampaign,
  onCampaign,
}: {
  campaigns: EmailCampaign[];
  content: ContentItem[];
  /** Pitches, including imported press sends. */
  match?: (campaign: EmailCampaign) => boolean;
  onCampaign?: (item: EmailCampaign) => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const titles = useMemo(
    () => new Map(content.map((item) => [item.id, item.title])),
    [content]
  );
  const pitches = useMemo(
    () =>
      campaigns
        .filter(match)
        .sort((a, b) => {
          const ta = new Date(a.sent_at || a.created_at).getTime();
          const tb = new Date(b.sent_at || b.created_at).getTime();
          return tb - ta;
        }),
    [campaigns, match]
  );

  async function followUp(campaign: EmailCampaign) {
    setBusyId(campaign.id);
    setError("");
    try {
      const res = await fetch("/api/email/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "follow_up", id: campaign.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create the follow-up");
      onCampaign?.(data.item);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the follow-up");
    } finally {
      setBusyId("");
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg text-brand">Pitches</h2>
          <p className="mt-1 text-sm text-muted">
            Press pitches and release sends. Open one in Email to edit the design.
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg bg-brand px-3 py-2 text-sm text-white"
          onClick={() => setCreateOpen(true)}
        >
          New pitch
        </button>
      </div>
      <CreateEmailDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      {error ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border text-xs text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Email name</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-3 py-3 font-medium">Recipients</th>
              <th className="px-3 py-3 font-medium">Open rate</th>
              <th className="px-3 py-3 font-medium">Click rate</th>
            </tr>
          </thead>
          <tbody>
            {pitches.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-muted">
                  No pitches yet. Start one here, or pitch a release.
                </td>
              </tr>
            ) : (
              pitches.map((pitch) => {
                const release = pitch.content_id
                  ? titles.get(pitch.content_id) ?? ""
                  : "";
                const releaseNote =
                  release &&
                  !pitch.title.toLowerCase().includes(release.toLowerCase()) &&
                  !release.toLowerCase().includes(pitch.title.toLowerCase())
                    ? `Release: ${release} · `
                    : "";
                return (
                  <tr key={pitch.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      {pitch.folder ? (
                        <div className="text-xs text-muted">{pitch.folder}</div>
                      ) : null}
                      <Link
                        href={campaignOpenHref(pitch)}
                        className="font-medium text-brand hover:underline"
                      >
                        {pitch.title}
                      </Link>
                      <div className="text-xs text-muted">
                        {releaseNote}
                        {campaignMetaLine(pitch)}
                      </div>
                      {pitch.status === "sent" ? (
                        <button
                          type="button"
                          className="mt-1 text-xs text-accent underline disabled:opacity-50"
                          disabled={busyId === pitch.id}
                          onClick={() => void followUp(pitch)}
                        >
                          Create follow-up
                        </button>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill
                        status={pitch.status}
                        label={STATUS_LABEL[pitch.status]}
                      />
                    </td>
                    <td className="px-3 py-3 tabular-nums">{pitch.stats.recipients}</td>
                    <td className="px-3 py-3 tabular-nums">
                      {campaignOpenRateLabel(pitch)}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {campaignClickRateLabel(pitch)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
