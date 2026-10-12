import Link from "next/link";
import type { EmailCampaign } from "@/lib/types";
import {
  campaignClickRateLabel,
  campaignOpenRateLabel,
  formatLondonStamp,
} from "@/lib/email/display";
import { previewMerge } from "@/lib/email/design/preview";
import { StatusPill } from "@/components/ui/StatusPill";

const STATUS_LABEL: Record<EmailCampaign["status"], string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function EmailCampaignSummary({
  campaign,
  audienceName,
}: {
  campaign: EmailCampaign;
  audienceName: string;
}) {
  const sentLabel = campaign.sent_at
    ? `${formatLondonStamp(campaign.sent_at)} London`
    : campaign.status === "sending"
      ? "Sending now"
      : "—";
  const previewHtml = campaign.html_body.trim()
    ? previewMerge(campaign.html_body)
    : "";

  const figures = [
    ["Delivered", String(campaign.stats.delivered)],
    ["Open rate", campaignOpenRateLabel(campaign)],
    ["Click rate", campaignClickRateLabel(campaign)],
    ["Recipients", String(campaign.stats.recipients)],
    ["Bounced", String(campaign.stats.bounced)],
    ["Unsubscribed", String(campaign.stats.unsubscribed)],
  ] as const;

  const details = [
    ["Subject line", campaign.subject || "—"],
    ["Preview text", campaign.preview_text || "—"],
    ["From", `${campaign.from_name || "—"} · ${campaign.from_email || "—"}`],
    ["Send to", audienceName || "—"],
    ["Sent", sentLabel],
  ] as const;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/app/email" className="btn-secondary px-3 py-1.5 text-sm">
          Back
        </Link>
        <h1 className="font-display text-2xl text-brand">{campaign.title}</h1>
        <StatusPill status={campaign.status} label={STATUS_LABEL[campaign.status]} />
      </div>

      {campaign.last_error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {campaign.last_error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {figures.map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border border-border bg-white px-4 py-3"
          >
            <div className="text-2xl font-medium text-brand">{value}</div>
            <div className="text-xs text-muted">{label}</div>
          </div>
        ))}
      </div>

      <dl className="grid gap-4 rounded-xl border border-border bg-white px-4 py-4 text-sm sm:grid-cols-2">
        {details.map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted">{label}</dt>
            <dd className="mt-1">{value}</dd>
          </div>
        ))}
      </dl>

      <section className="overflow-hidden rounded-xl border border-border bg-white">
        <h2 className="border-b border-border px-4 py-3 text-sm font-medium text-brand">
          Email
        </h2>
        {previewHtml ? (
          <iframe
            title="Sent email"
            sandbox=""
            className="block h-[720px] w-full bg-white"
            srcDoc={previewHtml}
          />
        ) : (
          <p className="px-4 py-6 text-sm text-muted">This email has no content.</p>
        )}
      </section>
    </div>
  );
}
