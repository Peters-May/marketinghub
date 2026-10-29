import Link from "next/link";
import { annotateClickMap } from "@/lib/email/click-map";
import type { CampaignReport } from "@/lib/email/campaign-report";
import { formatLondonStamp } from "@/lib/email/display";
import { previewMerge } from "@/lib/email/design/preview";
import type { EmailCampaign } from "@/lib/types";
import { CopyEmailButton } from "@/components/email/CopyEmailButton";
import { SendingProgress } from "@/components/email/SendingProgress";
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
  report,
  sentCount = 0,
  backHref = "/app/email",
  allowCopy = true,
}: {
  campaign: EmailCampaign;
  audienceName: string;
  report: CampaignReport;
  sentCount?: number;
  backHref?: string;
  allowCopy?: boolean;
}) {
  const sentLabel = campaign.sent_at
    ? `${formatLondonStamp(campaign.sent_at)} London`
    : campaign.status === "sending"
      ? "Sending now"
      : "—";
  const previewHtml = campaign.html_body.trim()
    ? annotateClickMap(previewMerge(campaign.html_body), report.links)
    : "";
  const engagementMax = seriesMax(report.days);
  const clientMax = Math.max(1, ...report.clients.map((row) => row.count));

  const details = [
    ["Subject line", campaign.subject || "—"],
    ["Preview text", campaign.preview_text || "—"],
    ["From", `${campaign.from_name || "—"} · ${campaign.from_email || "—"}`],
    ["Send to", audienceName || "—"],
    ["Sent", sentLabel],
  ] as const;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={backHref} className="btn-secondary px-3 py-1.5 text-sm">
          Back
        </Link>
        {allowCopy ? (
        <CopyEmailButton
          kind="campaign"
          id={campaign.id}
          className="btn-secondary px-3 py-1.5 text-sm"
          label="Copy for a new email"
        />
        ) : null}
        <h1 className="font-display text-2xl text-brand">{campaign.title}</h1>
        <StatusPill status={campaign.status} label={STATUS_LABEL[campaign.status]} />
      </div>

      {campaign.status === "sending" ? (
        <SendingProgress sent={sentCount} total={report.sentTo} />
      ) : null}

      <p className="text-sm text-muted">
        Sent to {report.sentTo.toLocaleString("en-GB")}. Delivered to{" "}
        {report.deliveredTo.toLocaleString("en-GB")}.
      </p>

      {campaign.last_error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {campaign.last_error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Figure label="Open rate" value={report.openRate} />
        <Figure label="Click rate" value={report.clickRate} />
      </div>

      <section className="rounded-xl border border-border bg-white px-4 py-4">
        <h2 className="text-sm font-medium text-brand">Delivery</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Figure label="Sent" value={String(report.delivery.sent)} plain />
          <Figure label="Bounced" value={String(report.delivery.bounced)} plain />
          <Figure
            label="Unsubscribed"
            value={String(report.delivery.unsubscribed)}
            plain
          />
          <Figure
            label="Marked as spam"
            value={String(report.delivery.complained)}
            plain
          />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.8fr)]">
        <section className="overflow-hidden rounded-xl border border-border bg-white">
          <h2 className="border-b border-border px-4 py-3 text-sm font-medium text-brand">
            Click map
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
          {report.links.length === 0 ? (
            <p className="border-t border-border px-4 py-3 text-sm text-muted">
              Clicks will appear here after Resend reports them.
            </p>
          ) : null}
        </section>

        <section className="rounded-xl border border-border bg-white">
          <h2 className="border-b border-border px-4 py-3 text-sm font-medium text-brand">
            Top clicked links
          </h2>
          {report.links.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">
              Clicks will appear here after Resend reports them.
            </p>
          ) : (
            <ol className="divide-y divide-border">
              {report.links.slice(0, 8).map((link) => (
                <li key={link.url} className="flex items-start gap-3 px-4 py-3 text-sm">
                  <span className="mt-0.5 inline-flex min-w-8 justify-center rounded-full bg-[#007DC5] px-2 py-0.5 text-xs font-medium text-white">
                    {link.count}
                  </span>
                  <a
                    href={link.url}
                    className="min-w-0 break-all text-brand underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {link.url}
                  </a>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-white">
          <h2 className="border-b border-border px-4 py-3 text-sm font-medium text-brand">
            Top engaging contacts
          </h2>
          {report.contacts.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">
              Contacts will appear here after opens and clicks are reported.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {report.contacts.map((contact) => (
                <li key={contact.email} className="px-4 py-3">
                  <div className="text-sm font-medium text-brand">{contact.name}</div>
                  {contact.name !== contact.email ? (
                    <div className="text-xs text-muted">{contact.email}</div>
                  ) : null}
                  <div className="mt-1 text-xs text-muted">
                    {contact.opens} {contact.opens === 1 ? "open" : "opens"} ·{" "}
                    {contact.clicks} {contact.clicks === 1 ? "click" : "clicks"}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-border bg-white">
          <h2 className="border-b border-border px-4 py-3 text-sm font-medium text-brand">
            Unsubscribed
          </h2>
          <div className="grid grid-cols-3 gap-3 border-b border-border px-4 py-3">
            <Figure
              label="Unsubscribe"
              value={String(report.suppressions.unsubscribe)}
              plain
            />
            <Figure label="Bounce" value={String(report.suppressions.bounce)} plain />
            <Figure
              label="Complaint"
              value={String(report.suppressions.complaint)}
              plain
            />
          </div>
          {report.unsubscribedPeople.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">
              No one has unsubscribed from this email yet.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {report.unsubscribedPeople.map((person) => (
                <li key={person.email} className="px-4 py-3">
                  <div className="text-sm font-medium text-brand">{person.name}</div>
                  {person.name !== person.email ? (
                    <div className="text-xs text-muted">{person.email}</div>
                  ) : null}
                  {person.detail ? (
                    <div className="mt-1 text-xs text-muted">Reason: {person.detail}</div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-border bg-white">
        <h2 className="border-b border-border px-4 py-3 text-sm font-medium text-brand">
          Bounced
        </h2>
        {report.bouncedPeople.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">
            No bounces recorded for this email.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {report.bouncedPeople.map((person) => (
              <li key={person.email} className="px-4 py-3">
                <div className="text-sm font-medium text-brand">{person.name}</div>
                {person.name !== person.email ? (
                  <div className="text-xs text-muted">{person.email}</div>
                ) : null}
                <div className="mt-1 text-xs text-muted">
                  {person.detail || "Removed from future marketing sends"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-border bg-white px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-brand">Engagement over time</h2>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-brand" />
              Opens
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-[#007DC5]" />
              Clicks
            </span>
          </div>
        </div>
        {report.days.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            Engagement will appear here after opens and clicks are reported.
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {report.days.map((day, index) => (
              <DayBar
                key={`${day.label}-${index}`}
                day={day}
                max={engagementMax}
              />
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-white px-4 py-4">
        <h2 className="text-sm font-medium text-brand">Opens by email client</h2>
        {report.clients.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            Mail client will appear here after opens are reported.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {report.clients.map((client) => (
              <ClientBar
                key={client.label}
                label={client.label}
                count={client.count}
                max={clientMax}
              />
            ))}
          </div>
        )}
      </section>

      <dl className="grid gap-4 rounded-xl border border-border bg-white px-4 py-4 text-sm sm:grid-cols-2">
        {details.map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted">{label}</dt>
            <dd className="mt-1">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Figure({
  label,
  value,
  plain = false,
}: {
  label: string;
  value: string;
  plain?: boolean;
}) {
  return (
    <div className={plain ? "" : "rounded-xl border border-border bg-white px-4 py-3"}>
      <div className="text-2xl font-medium text-brand">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

function seriesMax(days: { opens: number; clicks: number }[]): number {
  return Math.max(1, ...days.map((day) => day.opens + day.clicks));
}

function DayBar({
  day,
  max,
}: {
  day: { label: string; opens: number; clicks: number };
  max: number;
}) {
  const opens = (day.opens / max) * 100;
  const clicks = (day.clicks / max) * 100;
  return (
    <div className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 text-xs">
      <span className="text-muted">{day.label}</span>
      <div className="flex h-3 overflow-hidden rounded bg-[#E3E6E9]">
        <div className="h-full bg-brand" style={{ width: `${opens}%` }} />
        <div className="h-full bg-[#007DC5]" style={{ width: `${clicks}%` }} />
      </div>
      <span className="text-muted">
        {day.opens} / {day.clicks}
      </span>
    </div>
  );
}

function ClientBar({
  label,
  count,
  max,
}: {
  label: string;
  count: number;
  max: number;
}) {
  return (
    <div className="grid grid-cols-[7rem_1fr_auto] items-center gap-3 text-sm">
      <span>{label}</span>
      <div className="h-3 overflow-hidden rounded bg-[#E3E6E9]">
        <div
          className="h-full bg-brand"
          style={{ width: `${(count / max) * 100}%` }}
        />
      </div>
      <span className="text-muted">{count}</span>
    </div>
  );
}
