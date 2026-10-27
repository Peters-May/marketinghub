"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ContentItem, EmailCampaign } from "@/lib/types";
import { StatusPill } from "@/components/ui/StatusPill";
import { isPitchCampaign } from "@/lib/email/category";
import { compileEmailDesign, pressPitchDesign } from "@/lib/email/design";
import { formatLondonUpdated } from "@/lib/email/display";
import { PRESS_PITCH_TEMPLATE_ID } from "@/lib/pr/pitch-email";

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
}: {
  campaigns: EmailCampaign[];
  content: ContentItem[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const titles = useMemo(
    () => new Map(content.map((item) => [item.id, item.title])),
    [content]
  );
  const pitches = useMemo(
    () =>
      campaigns
        .filter(isPitchCampaign)
        .sort(
          (a, b) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        ),
    [campaigns]
  );

  async function createPitch() {
    setCreating(true);
    setError("");
    const design = pressPitchDesign();
    try {
      const res = await fetch("/api/email/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Untitled pitch",
          subject: "",
          preview_text: "",
          from_name: "Peters & May Marketing",
          from_email: "marketing@petersandmay.com",
          design,
          html_body: compileEmailDesign(design),
          template_id: PRESS_PITCH_TEMPLATE_ID,
          folder: "Press",
          category: "pitch",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create the pitch");
      router.push(`/app/email/design/campaign/${data.item.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the pitch");
      setCreating(false);
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg text-brand">Pitches</h2>
          <p className="mt-1 text-sm text-muted">
            Press pitches use the email editor. They are listed here, separate
            from marketing emails.
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg bg-brand px-3 py-2 text-sm text-white disabled:opacity-50"
          disabled={creating}
          onClick={() => void createPitch()}
        >
          {creating ? "Creating…" : "New pitch"}
        </button>
      </div>
      {error ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-white">
        {pitches.length === 0 ? (
          <li className="px-4 py-6 text-sm text-muted">
            No pitches yet. Start one here, or pitch a release.
          </li>
        ) : (
          pitches.map((pitch) => {
            const updated = formatLondonUpdated(pitch.updated_at);
            const release = pitch.content_id
              ? titles.get(pitch.content_id)
              : "";
            return (
              <li key={pitch.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/app/email/design/campaign/${pitch.id}`}
                      className="font-medium text-brand hover:underline"
                    >
                      {pitch.title}
                    </Link>
                    <div className="text-xs text-muted">
                      {release ? `Release: ${release}` : "No release linked"}
                      {updated.date !== "—"
                        ? ` · Updated ${updated.date}${updated.time ? `, ${updated.time}` : ""}`
                        : ""}
                    </div>
                  </div>
                  <StatusPill
                    status={pitch.status}
                    label={STATUS_LABEL[pitch.status]}
                  />
                </div>
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}
