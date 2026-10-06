"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ContentItem, EmailCampaign } from "@/lib/types";
import { StatusPill } from "@/components/ui/StatusPill";
import {
  campaignClickRateLabel,
  campaignMetaLine,
  campaignOpenRateLabel,
  formatCreatedAgo,
  formatLondonStamp,
} from "@/lib/email/display";

const STATUS_LABEL: Record<EmailCampaign["status"], string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
  cancelled: "Cancelled",
};

function storyTime(item: ContentItem): string {
  const iso = item.due_date || item.updated_at;
  return formatLondonStamp(iso);
}

export function ReleasesPanel({
  releases,
  campaigns,
  newsroomTitle,
  onRelease,
  onCampaign,
}: {
  releases: ContentItem[];
  campaigns: EmailCampaign[];
  newsroomTitle: string;
  onRelease: (item: ContentItem) => void;
  onCampaign: (item: EmailCampaign) => void;
}) {
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);

  const stories = useMemo(() => {
    const rows = showAll
      ? releases
      : releases.filter((r) => r.status === "published");
    return [...rows].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [releases, showAll]);

  const emails = useMemo(() => {
    const releaseIds = new Set(releases.map((r) => r.id));
    const linked = (c: EmailCampaign) =>
      (!!c.content_id && releaseIds.has(c.content_id)) ||
      c.folder === "Commercial" ||
      c.folder === "Forwarding" ||
      c.id.startsWith("ecamp_rel_");
    return campaigns
      .filter(
        (c) =>
          linked(c) ||
          (!!c.follow_up_of &&
            campaigns.some((parent) => parent.id === c.follow_up_of && linked(parent)))
      )
      .sort((a, b) => {
        const ta = new Date(a.sent_at || a.created_at).getTime();
        const tb = new Date(b.sent_at || b.created_at).getTime();
        return tb - ta;
      });
  }, [campaigns, releases]);

  async function place(
    item: ContentItem,
    patch: {
      pin_homepage?: boolean;
      in_slider?: boolean;
      newsroom_name?: string;
    }
  ) {
    setBusyId(item.id);
    setError("");
    try {
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "newsroom_placement", id: item.id, ...patch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update the story");
      onRelease(data.item);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the story");
    } finally {
      setBusyId("");
    }
  }

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
      onCampaign(data.item);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the follow-up");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="space-y-8">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <section>
        <h2 className="font-display text-lg text-brand">Release emails</h2>
        <p className="mt-1 text-sm text-muted">
          Sends linked to published stories. Open a campaign in Email to edit the design.
        </p>
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
              {emails.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-muted">
                    No release emails yet.
                  </td>
                </tr>
              ) : (
                emails.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      {c.folder ? (
                        <div className="text-xs text-muted">{c.folder}</div>
                      ) : null}
                      <Link
                        href={`/app/email?campaign=${encodeURIComponent(c.id)}`}
                        className="font-medium text-brand hover:underline"
                      >
                        {c.title}
                      </Link>
                      <div className="text-xs text-muted">{campaignMetaLine(c)}</div>
                      {c.status === "sent" ? (
                        <button
                          type="button"
                          className="mt-1 text-xs text-accent underline disabled:opacity-50"
                          disabled={busyId === c.id}
                          onClick={() => void followUp(c)}
                        >
                          Create follow-up
                        </button>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill status={c.status} label={STATUS_LABEL[c.status]} />
                    </td>
                    <td className="px-3 py-3 tabular-nums">{c.stats.recipients}</td>
                    <td className="px-3 py-3 tabular-nums">{campaignOpenRateLabel(c)}</td>
                    <td className="px-3 py-3 tabular-nums">{campaignClickRateLabel(c)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg text-brand">Published stories</h2>
          <button
            type="button"
            className="text-sm text-accent underline"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? "Published only" : "Show all releases"}
          </button>
        </div>
        <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-white">
          {stories.length === 0 ? (
            <li className="px-4 py-6 text-sm text-muted">No published stories yet.</li>
          ) : (
            stories.map((item) => {
              const assigned = item.newsroom_name !== "";
              const room = item.newsroom_name || newsroomTitle;
              const pinned = item.pin_homepage === true;
              const sliding = item.in_slider === true;
              return (
                <li key={item.id} className="px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={item.status} />
                    <span className="text-xs text-muted">{storyTime(item)}</span>
                  </div>
                  <h3 className="mt-2 font-medium text-brand">{item.title}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                    {assigned ? (
                      <span className="max-w-[12rem] truncate">{room}</span>
                    ) : (
                      <button
                        type="button"
                        className="text-accent underline disabled:opacity-50"
                        disabled={busyId === item.id}
                        onClick={() =>
                          void place(item, { newsroom_name: newsroomTitle })
                        }
                      >
                        Assign to a Newsroom
                      </button>
                    )}
                    {item.category ? <span>{item.category}</span> : null}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-brand/15 px-2.5 py-1 text-xs text-brand disabled:opacity-50"
                      disabled={busyId === item.id}
                      onClick={() =>
                        void place(item, { pin_homepage: !pinned })
                      }
                    >
                      {pinned ? "Unpin from homepage" : "Pin to homepage"}
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-brand/15 px-2.5 py-1 text-xs text-brand disabled:opacity-50"
                      disabled={busyId === item.id}
                      onClick={() => void place(item, { in_slider: !sliding })}
                    >
                      {sliding ? "Remove from slider" : "Add to slider"}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    {formatCreatedAgo(item.created_at)}
                    {item.owner ? ` by ${item.owner}` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3 text-sm">
                    <Link
                      href={`/newsroom#${item.id}`}
                      target="_blank"
                      className="text-accent underline"
                    >
                      Preview
                    </Link>
                    <Link
                      href={`/app/pr/emails?content_id=${encodeURIComponent(item.id)}`}
                      className="text-accent underline"
                    >
                      Pitch the story
                    </Link>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </section>
    </div>
  );
}
