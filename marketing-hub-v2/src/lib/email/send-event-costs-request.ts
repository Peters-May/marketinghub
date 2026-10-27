import { Resend } from "resend";
import { escapeHtml } from "@/lib/email/send-marketing-alert";

function appOrigin() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
}

/**
 * Ask one staff member to add their costs for an event.
 * Never includes other people's amounts. Skips gracefully if Resend is not configured.
 */
export async function sendEventCostsRequest(params: {
  to: string;
  eventName: string;
  /** Hub path, e.g. /app/events?open=…&costs=1 */
  path: string;
  requestedBy: string;
  note?: string;
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
  const note = params.note?.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p>${escapeHtml(params.requestedBy || "Marketing")} has asked you to add your costs for <strong>${escapeHtml(params.eventName)}</strong> in Marketing Hub.</p>
  <p>Add a line for each cost — travel, accommodation, print, or anything else. Leave the amount blank if you don't know it yet.</p>
  ${note ? `<p style="border-left: 3px solid #ddd; padding-left: 12px; color: #555;">${escapeHtml(note).replace(/\n/g, "<br/>")}</p>` : ""}
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
      subject: params.eventName,
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
