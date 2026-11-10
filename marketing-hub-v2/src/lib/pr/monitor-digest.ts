import { Resend } from "resend";
import { getPrMonitorSettings } from "@/lib/data/repos";
import { parseDigestEmails } from "@/lib/pr/monitor-settings";
import {
  brandedHubEmailHtml,
  emailAppOrigin,
  escapeHtml,
} from "@/lib/email/brand-shell";
import type { PrMonitorMention } from "@/lib/types";

function appOrigin(): string {
  const fromEnv = emailAppOrigin() || process.env.APP_URL?.trim() || "";
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (process.env.VERCEL_URL?.trim()) {
    return `https://${process.env.VERCEL_URL.trim().replace(/\/$/, "")}`;
  }
  return "";
}

/** Send a digest when cron added new mentions. Skips empty runs. */
export async function sendMonitorDigest(input: {
  mentions: PrMonitorMention[];
}): Promise<{ sent: boolean; recipients: number }> {
  if (input.mentions.length === 0) {
    return { sent: false, recipients: 0 };
  }
  const settings = await getPrMonitorSettings();
  const recipients = parseDigestEmails(settings.digest_emails);
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey || recipients.length === 0) {
    return { sent: false, recipients: recipients.length };
  }

  const origin = appOrigin();
  const href = origin
    ? `${origin}/app/pr/monitoring`
    : "/app/pr/monitoring";
  const count = input.mentions.length;
  const subject = `${count} new media mention${count === 1 ? "" : "s"}`;
  const preview = input.mentions
    .slice(0, 8)
    .map((m) => {
      const outlet = m.outlet ? ` (${m.outlet})` : "";
      return `<li style="margin:0 0 6px;">${escapeHtml(m.title)}${escapeHtml(outlet)}</li>`;
    })
    .join("");
  const more =
    count > 8
      ? `<p style="margin:12px 0 0;">…and ${count - 8} more.</p>`
      : "";
  const html = brandedHubEmailHtml({
    eyebrow: "Marketing Hub · PR monitoring",
    heading: subject,
    bodyHtml: `
      <p style="margin:0 0 14px;">Marketing Hub monitoring found new mentions for active queries.</p>
      <ul style="margin:0;padding-left:18px;">${preview}</ul>
      ${more}
    `,
    ctaLabel: "Open Mention Browser",
    ctaHref: href,
    footerNote: "Automated digest from Marketing Hub PR monitoring.",
  });
  const text = `${subject}\n\n${input.mentions
    .slice(0, 8)
    .map((m) => `- ${m.title}${m.outlet ? ` (${m.outlet})` : ""}`)
    .join("\n")}\n\n${href}`;

  try {
    const resend = new Resend(apiKey);
    const from =
      process.env.RESEND_FROM_EMAIL?.trim() || "marketing@petersandmay.com";
    const { error } = await resend.emails.send({
      from,
      to: recipients,
      subject,
      html,
      text,
    });
    if (error) {
      console.error("[pr/monitor] digest email failed", error.message);
      return { sent: false, recipients: recipients.length };
    }
    return { sent: true, recipients: recipients.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Email failed";
    console.error("[pr/monitor] digest email failed", message);
    return { sent: false, recipients: recipients.length };
  }
}

/**
 * Ops checklist for Hub PR Monitoring. Kept in code so deploy docs stay in sync.
 */
export const MONITOR_CUTOVER_CHECKLIST = [
  "Confirm NEWS_API_KEY is set on Vercel production for marketinghub (paid NewsAPI plan for production servers)",
  "Confirm RESEND_API_KEY / RESEND_FROM_EMAIL for digest mail",
  "Set digest recipients under PR → Monitoring → Digest settings",
  "Tune brand query keywords and exclusions (e.g. market-report spam domains)",
  "Run a query from Mentions and confirm new items land in the inbox",
  "Trigger /api/pr/monitor/cron once with CRON_SECRET and confirm digest",
] as const;
