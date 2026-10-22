import { Resend } from "resend";
import { getChatSettings } from "@/lib/chat/data";
import type { ChatSession } from "@/lib/types";

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

function transcriptToHtml(transcript: string): string {
  return escapeHtml(transcript).replace(/\n/g, "<br/>");
}

function uniqueEmails(emails: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of emails) {
    const trimmed = (raw ?? "").trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || !trimmed.includes("@") || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

async function sendResendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[chat-email] RESEND_API_KEY not set, skipping");
    return { success: false, error: "Email not configured" };
  }
  const from =
    process.env.RESEND_FROM_EMAIL?.trim() || "marketing@petersandmay.com";
  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      ...(params.text ? { text: params.text } : {}),
    });
    if (error) {
      console.error("[chat-email]", error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Email failed";
    console.error("[chat-email]", message);
    return { success: false, error: message };
  }
}

export async function notifyChatStaff(params: {
  kind: "waiting" | "lead";
  sessionId: string;
  visitorEmail?: string;
}): Promise<{ success: boolean; error?: string }> {
  const settings = await getChatSettings();
  const to =
    settings.notify_email.trim() ||
    process.env.CHAT_NOTIFY_EMAIL?.trim() ||
    process.env.MARKETING_ALERT_EMAIL?.trim() ||
    "marketing@petersandmay.com";

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

  return sendResendEmail({ to, subject: what, html });
}

/**
 * Email the full transcript to:
 * - the visitor (if email supplied)
 * - the staff assignee (if someone took over / replied)
 * - the chat notify inbox (when configured)
 */
export async function emailChatTranscript(params: {
  session: ChatSession;
  transcript: string;
  reason: "lead" | "closed";
}): Promise<{ sent: string[]; errors: string[] }> {
  const transcript = params.transcript.trim();
  if (!transcript) {
    return { sent: [], errors: ["empty_transcript"] };
  }

  const settings = await getChatSettings();
  const notifyInbox =
    settings.notify_email.trim() ||
    process.env.CHAT_NOTIFY_EMAIL?.trim() ||
    process.env.MARKETING_ALERT_EMAIL?.trim() ||
    "";

  const visitorEmail = params.session.visitor_email.trim();
  const assigneeEmail = params.session.assignee_email.trim();
  const recipients = uniqueEmails([
    visitorEmail,
    assigneeEmail,
    notifyInbox,
  ]);

  if (recipients.length === 0) {
    return { sent: [], errors: ["no_recipients"] };
  }

  const title =
    params.reason === "closed"
      ? "Your Peters & May website chat transcript"
      : "Your Peters & May website chat enquiry";
  const staffTitle =
    params.reason === "closed"
      ? "Website chat closed — transcript"
      : "Website chat lead — transcript";
  const page =
    params.session.page_title || params.session.page_url || params.session.id;
  const origin = appOrigin();
  const href = origin
    ? `${origin}/app/chat?session=${encodeURIComponent(params.session.id)}`
    : "";

  const sent: string[] = [];
  const errors: string[] = [];

  for (const to of recipients) {
    const isVisitor =
      Boolean(visitorEmail) &&
      to.toLowerCase() === visitorEmail.toLowerCase();
    const subject = isVisitor ? title : staffTitle;
    const intro = isVisitor
      ? `<p>Thank you for chatting with Peters &amp; May. Here is a copy of your conversation${
          params.reason === "closed" ? " (now closed)" : ""
        }.</p>`
      : `<p><strong>${escapeHtml(staffTitle)}</strong></p>
         <p>Page: ${escapeHtml(page)}</p>
         <p>Session: ${escapeHtml(params.session.id)}</p>
         ${
           visitorEmail
             ? `<p>Visitor: ${escapeHtml(visitorEmail)}</p>`
             : ""
         }
         ${
           href
             ? `<p><a href="${escapeHtml(href)}" style="color: #007DC5;">Open in Marketing Hub</a></p>`
             : ""
         }`;

    const html = `
<!DOCTYPE html>
<html>
<body style="font-family: system-ui, sans-serif; line-height: 1.6; color: #0B2545; max-width: 640px; margin: 0 auto; padding: 20px;">
  ${intro}
  <div style="margin-top: 16px; padding: 16px; background: #F5F6F8; border-radius: 8px; font-size: 14px;">
    ${transcriptToHtml(transcript)}
  </div>
  <p style="color: #666; font-size: 12px; margin-top: 20px;">Peters &amp; May — automated chat transcript.</p>
</body>
</html>`.trim();

    const result = await sendResendEmail({
      to,
      subject,
      html,
      text: `${isVisitor ? title : staffTitle}\n\n${transcript}`,
    });
    if (result.success) sent.push(to);
    else errors.push(`${to}: ${result.error ?? "failed"}`);
  }

  return { sent, errors };
}

/** Email a staff reply to the visitor when we have their address. */
export async function emailVisitorStaffReply(params: {
  to: string;
  reply: string;
  authorName?: string;
}): Promise<{ success: boolean; error?: string }> {
  const to = params.to.trim();
  const reply = params.reply.trim();
  if (!to.includes("@") || !reply) {
    return { success: false, error: "No visitor email" };
  }
  const who = (params.authorName || "The team").trim() || "The team";
  const subject = "Peters & May replied to your website chat";
  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: system-ui, sans-serif; line-height: 1.6; color: #0B2545; max-width: 640px; margin: 0 auto; padding: 20px;">
  <p>${escapeHtml(who)} from Peters &amp; May replied to your website chat:</p>
  <div style="margin-top: 16px; padding: 16px; background: #F5F6F8; border-radius: 8px; font-size: 14px;">
    ${transcriptToHtml(reply)}
  </div>
  <p>If the chat is still open on the website, you can continue the conversation there.</p>
  <p style="color: #666; font-size: 12px; margin-top: 20px;">Peters &amp; May — automated chat reply.</p>
</body>
</html>`.trim();
  return sendResendEmail({
    to,
    subject,
    html,
    text: `${who} from Peters & May replied to your website chat:\n\n${reply}\n\nIf the chat is still open on the website, you can continue the conversation there.`,
  });
}
