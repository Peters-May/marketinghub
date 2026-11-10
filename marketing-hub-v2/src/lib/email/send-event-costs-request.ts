import { Resend } from "resend";
import {
  brandedHubEmailHtml,
  emailAppOrigin,
  escapeHtml,
} from "@/lib/email/brand-shell";

function messageToHtml(message: string) {
  return escapeHtml(message.trim())
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 14px;">${block.replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
}

/**
 * Ask one staff member to add their costs for an event.
 * Never includes other people's amounts. Skips gracefully if Resend is not configured.
 */
export async function sendEventCostsRequest(params: {
  to: string;
  subject: string;
  /** Plain-text body the requester personalised in the Hub. */
  message: string;
  /** Hub path, e.g. /app/events?open=…&costs=1 */
  path: string;
}): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[sendEventCostsRequest] RESEND_API_KEY not set, skipping email");
    return { success: false, error: "Email not configured" };
  }

  const from =
    process.env.RESEND_FROM_EMAIL?.trim() || "marketing@petersandmay.com";
  const origin = emailAppOrigin();
  const href = origin ? `${origin}${params.path}` : params.path;
  const subject = params.subject.trim() || "Event costs";
  const message = params.message.trim();
  if (!message) {
    return { success: false, error: "Message is empty" };
  }

  const html = brandedHubEmailHtml({
    eyebrow: "Marketing Hub · Events",
    heading: subject,
    bodyHtml: messageToHtml(message),
    ctaLabel: "Add your costs",
    ctaHref: href,
    footerNote: "Automated notification from Marketing Hub.",
  });

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: params.to,
      subject,
      html,
    });
    if (error) {
      console.error("[sendEventCostsRequest] Resend error:", JSON.stringify(error));
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: unknown) {
    const msg = (err as { message?: string })?.message || "Unknown error";
    console.error("[sendEventCostsRequest] Failed:", err);
    return { success: false, error: msg };
  }
}
