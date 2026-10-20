import { Resend } from "resend";
import { getChatSettings } from "@/lib/chat/data";

function appOrigin() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function notifyChatStaff(params: {
  kind: "waiting" | "lead";
  sessionId: string;
  visitorEmail?: string;
}): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[notifyChatStaff] RESEND_API_KEY not set, skipping");
    return { success: false, error: "Email not configured" };
  }

  const settings = await getChatSettings();
  const to =
    settings.notify_email.trim() ||
    process.env.CHAT_NOTIFY_EMAIL?.trim() ||
    process.env.MARKETING_ALERT_EMAIL?.trim() ||
    "marketing@petersandmay.com";
  const from =
    process.env.RESEND_FROM_EMAIL?.trim() || "marketing@petersandmay.com";

  const what =
    params.kind === "waiting"
      ? "Website chat — visitor waiting for the team"
      : "Website chat — new lead captured";
  const origin = appOrigin();
  const href = origin
    ? `${origin}/app/chat?session=${encodeURIComponent(params.sessionId)}`
    : `/app/chat?session=${encodeURIComponent(params.sessionId)}`;

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: system-ui, sans-serif; line-height: 1.6; color: #0B2545; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p><strong>${escapeHtml(what)}</strong></p>
  <p>Session: ${escapeHtml(params.sessionId)}</p>
  ${
    params.visitorEmail
      ? `<p>Email: ${escapeHtml(params.visitorEmail)}</p>`
      : ""
  }
  <p><a href="${escapeHtml(href)}" style="color: #007DC5;">Open chat inbox in Marketing Hub</a></p>
  <p style="color: #666; font-size: 12px;">Automated notification from Marketing Hub website chat.</p>
</body>
</html>`.trim();

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to,
      subject: what,
      html,
    });
    if (error) {
      console.error("[notifyChatStaff]", error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Notify failed";
    console.error("[notifyChatStaff]", message);
    return { success: false, error: message };
  }
}
