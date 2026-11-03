import { Resend } from "resend";
import { getPrMonitorSettings } from "@/lib/data/repos";
import { parseDigestEmails } from "@/lib/pr/monitor-settings";
import type { PrMonitorMention } from "@/lib/types";

function appOrigin(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "";
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
      return `• ${m.title}${outlet}`;
    })
    .join("<br/>");
  const more =
    count > 8 ? `<p>…and ${count - 8} more.</p>` : "";
  const html = `<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.5; color: #0B2545; max-width: 560px; margin: 0 auto; padding: 24px;">
  <p><strong>${subject}</strong></p>
  <p>Marketing Hub monitoring found new mentions for active queries.</p>
  <p>${preview}</p>
  ${more}
  <p><a href="${href}" style="color: #007DC5;">Open Mention Browser</a></p>
</body>
</html>`;
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
 * Ops cutover checklist (Owly → Hub). Kept in code so deploy docs stay in sync.
 */
export const MONITOR_CUTOVER_CHECKLIST = [
  "Confirm NEWS_API_KEY is set on Vercel production for marketinghub",
  "Confirm RESEND_API_KEY / RESEND_FROM_EMAIL for digest mail",
  "Set digest recipients under PR → Monitoring → Digest settings",
  "Export mentions CSV from Owly and import via Mentions → Import Owly CSV",
  "Verify imported count and spot-check sentiment / outlets",
  "Tune brand query keywords and exclusions (e.g. market-report spam domains)",
  "Trigger /api/pr/monitor/cron once with CRON_SECRET and confirm digest",
  "Cancel Owly subscription once the Hub inbox is trusted for daily review",
] as const;
