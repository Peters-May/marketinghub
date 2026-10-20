import type { ChatMessage, ChatSession } from "@/lib/types";
import { upsertWebEnquiryFromWebhook } from "@/lib/data/web-enquiries";
import { syncWebEnquiryToPortal } from "@/lib/sync/portal-enquiries";
import {
  getChatSession,
  listChatMessages,
  updateChatSession,
} from "@/lib/chat/data";
import { suggestOfficeFromEnquiryText } from "@/lib/chat/enquiry-guidance";
import { emailChatTranscript, notifyChatStaff } from "@/lib/chat/notify";

/** Readable transcript for Hub / Portal enquiry body. */
export function formatChatTranscript(messages: ChatMessage[]): string {
  return messages
    .map((m) => {
      const who =
        m.role === "visitor"
          ? "Visitor"
          : m.role === "staff"
            ? "Staff"
            : m.role === "assistant"
              ? "Assistant"
              : "System";
      const body = (m.body ?? "").trim();
      if (!body) return "";
      return `[${who}] ${body}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Upsert a web enquiry from a chat session and mirror to Portal.
 * submission_id = chat:<sessionId>
 */
export async function bridgeChatSessionToEnquiry(
  session: ChatSession,
  opts?: {
    name?: string;
    email?: string;
    company?: string;
    message?: string;
    notify?: boolean;
    closed?: boolean;
  }
): Promise<{ enquiryId: string; submissionId: string }> {
  const name = (opts?.name ?? session.visitor_name).trim();
  const email = (opts?.email ?? session.visitor_email).trim();
  const company = (opts?.company ?? session.visitor_company).trim();
  const submissionId = `chat:${session.id}`;

  const message =
    opts?.message?.trim() ||
    `Website chat lead from ${session.page_title || session.page_url || "site"}`;

  const suggestedOffice = suggestOfficeFromEnquiryText(
    [message, name, company, session.page_title, session.page_url].join(" ")
  );

  const utm = session.utm ?? {};
  const body: Record<string, unknown> = {
    channel: "website_chat",
    submission_id: submissionId,
    source: "website_chat",
    customer: {
      name,
      email,
      phone: "",
      country: "",
    },
    make_fields: {
      submission_id: submissionId,
      customer_name: name,
      customer_email: email,
      customer_company: company,
      created_at: new Date().toISOString(),
      page_location: session.page_url,
      referrer: session.referrer,
      utm_source: String(utm.utm_source ?? "website_chat"),
      utm_medium: String(utm.utm_medium ?? "chat"),
      utm_campaign: String(utm.utm_campaign ?? ""),
      heard_about: "Website chat",
      chat_session_id: session.id,
      chat_message: message,
      chat_closed: opts?.closed === true,
      ...(suggestedOffice ? { selected_office: suggestedOffice } : {}),
    },
    tracking: {
      current_page_url: session.page_url,
      referrer: session.referrer,
      utm_source: String(utm.utm_source ?? "website_chat"),
      utm_medium: String(utm.utm_medium ?? "chat"),
      utm_campaign: String(utm.utm_campaign ?? ""),
      heard_about: "Website chat",
    },
    routing: {
      routing_reason: suggestedOffice
        ? `website_chat_origin_hint:${suggestedOffice}`
        : "website_chat",
      ...(suggestedOffice ? { selected_office: suggestedOffice } : {}),
      needs_manual_review: true,
    },
    form_fields: {
      Company: company,
      Message: message,
      "Page Location": session.page_url,
    },
  };

  const enquiry = await upsertWebEnquiryFromWebhook(body);
  await syncWebEnquiryToPortal(body);
  const updated = await updateChatSession(session.id, {
    enquiry_id: enquiry.id,
    visitor_name: name || session.visitor_name,
    visitor_email: email || session.visitor_email,
    visitor_company: company || session.visitor_company,
  });
  const sessionForMail = updated ?? {
    ...session,
    visitor_name: name || session.visitor_name,
    visitor_email: email || session.visitor_email,
    visitor_company: company || session.visitor_company,
    enquiry_id: enquiry.id,
  };

  // Email full transcript to visitor, staff assignee, and notify inbox when possible.
  // Falls back to a short staff alert if there is no transcript yet.
  const messages = await listChatMessages(session.id);
  const transcriptFromOpt =
    opts?.message && opts.message.includes("--- Transcript ---")
      ? opts.message.split("--- Transcript ---\n\n").pop()?.trim() ?? ""
      : "";
  const transcript =
    transcriptFromOpt || formatChatTranscript(messages);
  if (transcript.trim() && (email || session.assignee_email.trim())) {
    void emailChatTranscript({
      session: sessionForMail,
      transcript,
      reason: opts?.closed ? "closed" : "lead",
    });
  } else if (opts?.notify !== false && email) {
    void notifyChatStaff({
      kind: "lead",
      sessionId: session.id,
      visitorEmail: email,
    });
  }

  return { enquiryId: enquiry.id, submissionId };
}

/**
 * When staff closes a chat that has contact details, upsert Hub + Portal
 * with the full transcript (idempotent on submission_id chat:<sessionId>).
 */
export async function syncClosedChatSessionToPortal(
  sessionId: string
): Promise<
  | { ok: true; enquiryId: string; submissionId: string }
  | { ok: true; skipped: true; reason: string }
  | { ok: false; error: string }
> {
  try {
    const session = await getChatSession(sessionId);
    if (!session) {
      return { ok: true, skipped: true, reason: "session_not_found" };
    }
    if (session.is_test) {
      return { ok: true, skipped: true, reason: "test_session" };
    }

    const email = (session.visitor_email ?? "").trim();
    const messages = await listChatMessages(sessionId);
    const transcript = formatChatTranscript(messages);

    // No visitor email → still email staff assignee / notify inbox if involved.
    if (!email) {
      if (transcript.trim() && session.assignee_email.trim()) {
        void emailChatTranscript({
          session,
          transcript,
          reason: "closed",
        });
      }
      return { ok: true, skipped: true, reason: "no_contact_email" };
    }

    const header = `Website chat closed — ${
      session.page_title || session.page_url || session.id
    }`;
    const message = transcript
      ? `${header}\n\n--- Transcript ---\n\n${transcript}`
      : header;

    const result = await bridgeChatSessionToEnquiry(session, {
      email,
      name: session.visitor_name,
      company: session.visitor_company,
      message,
      notify: false,
      closed: true,
    });

    return { ok: true, ...result };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Close sync failed";
    console.error("[chat-close-portal-sync]", sessionId, error);
    return { ok: false, error };
  }
}
