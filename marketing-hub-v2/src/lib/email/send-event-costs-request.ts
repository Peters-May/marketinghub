import { Resend } from "resend";
import { escapeHtml } from "@/lib/email/send-marketing-alert";

function appOrigin() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
}

function messageToHtml(message: string) {
  return escapeHtml(message.trim())
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, "<br/>")}</p>`)
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
  const origin = appOrigin();
  const href = origin ? `${origin}${params.path}` : params.path;
  const subject = params.subject.trim() || "Event costs";
  const message = params.message.trim();
  if (!message) {
    return { success: false, error: "Message is empty" };
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  ${messageToHtml(message)}
  <p><a href="${escapeHtml(href)}" style="color: #0f766e; text-decoration: none;">Add your costs →</a></p>
  <p style="color: #666; font-size: 12px;">Automated notification from Marketing Hub.</p>
</body>
</html>
`.trim();

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
