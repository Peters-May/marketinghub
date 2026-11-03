import { Resend } from "resend";
import { getChatSettings, getChatSession, listChatMessages } from "@/lib/chat/data";
import type { ChatMessage, ChatSession } from "@/lib/types";

const NAVY = "#0B2545";
const BLUE = "#007DC5";
const MIST = "#E3E6E9";
const GREY = "#5b6472";

function appOrigin() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
}

export function escapeHtml(s: string): string {
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

function logoUrl(): string {
  const origin = appOrigin();
  return origin
    ? `${origin}/pm-group-logo.png`
    : "https://marketing.petersandmay.com/pm-group-logo.png";
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/London",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function visitorLabel(
  session: Pick<ChatSession, "visitor_name" | "visitor_email" | "visitor_company">
): string {
  const name = session.visitor_name.trim();
  const email = session.visitor_email.trim();
  const company = session.visitor_company.trim();
  if (name && email) {
    return company ? `${name} (${email}), ${company}` : `${name} (${email})`;
  }
  if (name) return company ? `${name}, ${company}` : name;
  if (email) return company ? `${email}, ${company}` : email;
  if (company) return company;
  return "A website visitor (details not yet given)";
}

function pageLabel(session: Pick<ChatSession, "page_title" | "page_url">): string {
  const title = session.page_title.trim();
  const url = session.page_url.trim();
  if (title && url) return `${title} — ${url}`;
  return title || url || "Website (page not recorded)";
}

function latestVisitorSnippets(messages: ChatMessage[], limit = 3): string[] {
  return messages
    .filter((m) => m.role === "visitor" && m.body.trim())
    .slice(-limit)
    .map((m) => m.body.trim().slice(0, 400));
}

function latestStaffSnippet(messages: ChatMessage[]): string {
  const staff = [...messages]
    .reverse()
    .find((m) => m.role === "staff" && m.body.trim());
  return staff?.body.trim().slice(0, 800) ?? "";
}

export type ChatEmailDetailProps = {
  eyebrow: string;
  heading: string;
  intro: string;
  rows: Array<{ label: string; value: string; href?: string }>;
  snippetsLabel?: string;
  snippets?: string[];
  ctaLabel?: string;
  ctaHref?: string;
  footerNote?: string;
};

/** Branded HTML shell for website-chat staff and visitor emails. */
export function brandedChatEmailHtml(props: ChatEmailDetailProps): string {
  const rowsHtml = props.rows
    .filter((row) => row.value.trim())
    .map((row) => {
      const value = row.href
        ? `<a href="${escapeHtml(row.href)}" style="color:${BLUE};">${escapeHtml(row.value)}</a>`
        : escapeHtml(row.value);
      return `<tr>
  <td style="padding:8px 0; width:120px; vertical-align:top; color:${GREY}; font-size:13px;">${escapeHtml(row.label)}</td>
  <td style="padding:8px 0; vertical-align:top; color:${NAVY}; font-size:14px;">${value}</td>
</tr>`;
    })
    .join("");

  const snippetsHtml =
    props.snippets && props.snippets.length
      ? `<div style="margin-top:18px; padding:14px 16px; background:${MIST}; border-radius:8px;">
  <p style="margin:0 0 8px; font-size:12px; letter-spacing:0.04em; text-transform:uppercase; color:${GREY};">${escapeHtml(props.snippetsLabel || "Conversation")}</p>
  ${props.snippets
    .map(
      (s) =>
        `<p style="margin:0 0 10px; font-size:14px; color:${NAVY};">${transcriptToHtml(s)}</p>`
    )
    .join("")}
</div>`
      : "";

  const ctaHtml =
    props.ctaHref && props.ctaLabel
      ? `<p style="margin:24px 0 0;">
  <a href="${escapeHtml(props.ctaHref)}" style="display:inline-block; background:${BLUE}; color:#ffffff; text-decoration:none; font-weight:600; font-size:14px; padding:12px 18px; border-radius:6px;">${escapeHtml(props.ctaLabel)}</a>
</p>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/></head>
<body style="margin:0; padding:0; background:#f4f6f7; font-family:Arial, Helvetica, sans-serif; line-height:1.5; color:${NAVY};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f7; padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px; background:#ffffff; border-radius:10px; overflow:hidden; border:1px solid ${MIST};">
        <tr>
          <td style="background:${NAVY}; padding:20px 24px;">
            <img src="${escapeHtml(logoUrl())}" alt="Peters &amp; May" width="160" style="display:block; max-width:160px; height:auto; border:0;"/>
            <p style="margin:14px 0 0; font-size:12px; letter-spacing:0.06em; text-transform:uppercase; color:#c5d0db;">${escapeHtml(props.eyebrow)}</p>
            <h1 style="margin:6px 0 0; font-size:22px; line-height:1.3; color:#ffffff; font-weight:700;">${escapeHtml(props.heading)}</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:24px;">
            <p style="margin:0 0 16px; font-size:15px; color:${NAVY};">${escapeHtml(props.intro)}</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid ${MIST}; border-bottom:1px solid ${MIST};">
              ${rowsHtml}
            </table>
            ${snippetsHtml}
            ${ctaHtml}
            <p style="margin:28px 0 0; font-size:12px; color:${GREY};">${escapeHtml(props.footerNote || "Automated message from the Peters & May Marketing Hub website chat.")}</p>
          </td>
        </tr>
      </table>
      <p style="margin:16px 0 0; font-size:11px; color:${GREY};">Peters &amp; May — bespoke logistics</p>
    </td></tr>
  </table>
</body>
</html>`.trim();
}

async function resolveTeamReplyTo(
  session?: Pick<ChatSession, "assignee_email"> | null
): Promise<string> {
  const settings = await getChatSettings();
  const candidates = [
    session?.assignee_email,
    settings.notify_email,
    process.env.CHAT_NOTIFY_EMAIL,
    process.env.MARKETING_ALERT_EMAIL,
    process.env.RESEND_FROM_EMAIL,
    "marketing@petersandmay.com",
  ];
  return uniqueEmails(candidates)[0] || "marketing@petersandmay.com";
}

async function sendResendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
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
      ...(params.replyTo ? { replyTo: params.replyTo } : {}),
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

function inboxHref(sessionId: string): string {
  const origin = appOrigin();
  return origin
    ? `${origin}/app/chat?session=${encodeURIComponent(sessionId)}`
    : `https://marketing.petersandmay.com/app/chat?session=${encodeURIComponent(sessionId)}`;
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

  const session = await getChatSession(params.sessionId);
  const messages = session
    ? await listChatMessages(params.sessionId).catch(() => [] as ChatMessage[])
    : [];
  const snippets = latestVisitorSnippets(messages);
  const who = session
    ? visitorLabel({
        visitor_name: session.visitor_name,
        visitor_email: params.visitorEmail || session.visitor_email,
        visitor_company: session.visitor_company,
      })
    : params.visitorEmail?.trim() || "A website visitor";
  const where = session ? pageLabel(session) : "Website (page not recorded)";
  const when = formatWhen(session?.last_message_at || session?.updated_at);
  const href = inboxHref(params.sessionId);

  const isWaiting = params.kind === "waiting";
  const subject = isWaiting
    ? `Website chat: ${who} is waiting for the team`
    : `Website chat: new enquiry from ${who}`;
  const heading = isWaiting
    ? "A visitor has asked to speak to the team"
    : "A new website chat enquiry is ready to review";
  const intro = isWaiting
    ? "Someone on the Peters & May website used chat and asked for a person. Open the inbox to reply, take over from the assistant, or assign a colleague."
    : "The website chat captured contact details for follow-up. Review the conversation in Marketing Hub and continue in Enquiries if needed.";

  const email =
    (params.visitorEmail || session?.visitor_email || "").trim();

  const html = brandedChatEmailHtml({
    eyebrow: "Marketing Hub · Website chat",
    heading,
    intro,
    rows: [
      { label: "Who", value: who },
      {
        label: "Email",
        value: email,
        href: email ? `mailto:${email}` : undefined,
      },
      { label: "Company", value: session?.visitor_company?.trim() || "" },
      { label: "Where", value: where },
      { label: "When", value: when },
      {
        label: "What",
        value: isWaiting
          ? "Asked to speak to a person (handover)"
          : "Left contact details for follow-up",
      },
    ],
    snippetsLabel: "Recent visitor messages",
    snippets,
    ctaLabel: "Open chat inbox",
    ctaHref: href,
    footerNote:
      "Automated alert from Marketing Hub. Reply in the chat inbox — do not reply to this email.",
  });

  const text = [
    heading,
    "",
    intro,
    "",
    `Who: ${who}`,
    `Where: ${where}`,
    when ? `When: ${when}` : "",
    snippets.length ? `Recent messages:\n- ${snippets.join("\n- ")}` : "",
    "",
    `Open inbox: ${href}`,
  ]
    .filter(Boolean)
    .join("\n");

  return sendResendEmail({ to, subject, html, text });
}

/**
 * Email the full transcript when a chat ends (or staff-only on lead paths).
 * Visitor emails are replyable: Reply-To goes to the assignee / notify inbox.
 * Live staff replies while the chat is open do not send email.
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
  const recipients = uniqueEmails(
    params.reason === "closed"
      ? [visitorEmail, assigneeEmail, notifyInbox]
      : [assigneeEmail, notifyInbox]
  );

  if (recipients.length === 0) {
    return { sent: [], errors: ["no_recipients"] };
  }

  const who = visitorLabel(params.session);
  const where = pageLabel(params.session);
  const when = formatWhen(
    params.session.last_message_at || params.session.updated_at
  );
  const href = inboxHref(params.session.id);
  const replyTo = await resolveTeamReplyTo(params.session);

  let lastStaff = "";
  try {
    const messages = await listChatMessages(params.session.id);
    lastStaff = latestStaffSnippet(messages);
  } catch {
    lastStaff = "";
  }

  const sent: string[] = [];
  const errors: string[] = [];

  for (const to of recipients) {
    const isVisitor =
      Boolean(visitorEmail) &&
      to.toLowerCase() === visitorEmail.toLowerCase();

    // Visitor only gets mail when the chat has ended — and can reply by email.
    if (isVisitor && params.reason !== "closed") continue;

    const subject = isVisitor
      ? "Your Peters & May website chat — reply to continue"
      : params.reason === "closed"
        ? `Website chat closed — ${who}`
        : `Website chat lead transcript — ${who}`;

    const heading = isVisitor
      ? "Your website chat has ended"
      : params.reason === "closed"
        ? "Website chat closed"
        : "Website chat lead transcript";

    const intro = isVisitor
      ? lastStaff
        ? "Thank you for chatting with Peters & May. Below is a copy of the conversation, including the latest reply from the team. Reply to this email to continue the conversation — your message will reach the team."
        : "Thank you for chatting with Peters & May. Below is a copy of the conversation for your records. Reply to this email if you would like the team to continue helping you."
      : params.reason === "closed"
        ? "This website chat has been closed. Below is the full transcript for your records."
        : "A website chat lead was captured. Below is the transcript — open Marketing Hub to continue.";

    const rows: ChatEmailDetailProps["rows"] = isVisitor
      ? [
          { label: "About", value: "Peters & May website chat" },
          { label: "Page", value: where },
          { label: "When", value: when },
          { label: "Reply to", value: replyTo },
        ]
      : [
          { label: "Who", value: who },
          {
            label: "Email",
            value: visitorEmail,
            href: visitorEmail ? `mailto:${visitorEmail}` : undefined,
          },
          { label: "Company", value: params.session.visitor_company.trim() },
          { label: "Where", value: where },
          { label: "When", value: when },
        ];

    const html = brandedChatEmailHtml({
      eyebrow: "Peters & May · Website chat",
      heading,
      intro,
      rows,
      snippetsLabel: isVisitor
        ? lastStaff
          ? "Latest team reply and transcript"
          : "Conversation"
        : "Transcript",
      snippets: isVisitor && lastStaff
        ? [`Team: ${lastStaff}`, transcript.slice(0, 5000)]
        : [transcript.slice(0, 6000)],
      ctaLabel: isVisitor ? undefined : "Open in Marketing Hub",
      ctaHref: isVisitor ? undefined : href,
      footerNote: isVisitor
        ? "Reply to this email to continue with the Peters & May team. Do not use the website chat window if it is already closed."
        : "Automated transcript from Marketing Hub. Reply in the inbox — do not reply to this email.",
    });

    const text = isVisitor
      ? [
          heading,
          "",
          intro,
          "",
          lastStaff ? `Latest team reply:\n${lastStaff}\n` : "",
          "Conversation:",
          transcript,
          "",
          `Reply to this email (${replyTo}) to continue with the team.`,
        ]
          .filter(Boolean)
          .join("\n")
      : `${subject}\n\n${who}\n${where}\n\n${transcript}`;

    const result = await sendResendEmail({
      to,
      subject,
      html,
      text,
      ...(isVisitor ? { replyTo } : {}),
    });
    if (result.success) sent.push(to);
    else errors.push(`${to}: ${result.error ?? "failed"}`);
  }

  return { sent, errors };
}
