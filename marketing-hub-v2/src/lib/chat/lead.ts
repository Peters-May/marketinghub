import type { ChatSession } from "@/lib/types";
import { upsertWebEnquiryFromWebhook } from "@/lib/data/web-enquiries";
import { syncWebEnquiryToPortal } from "@/lib/sync/portal-enquiries";
import { updateChatSession } from "@/lib/chat/data";
import { suggestOfficeFromEnquiryText } from "@/lib/chat/enquiry-guidance";
import { notifyChatStaff } from "@/lib/chat/notify";

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
  await updateChatSession(session.id, {
    enquiry_id: enquiry.id,
    visitor_name: name || session.visitor_name,
    visitor_email: email || session.visitor_email,
    visitor_company: company || session.visitor_company,
  });

  if (opts?.notify !== false && email) {
    void notifyChatStaff({
      kind: "lead",
      sessionId: session.id,
      visitorEmail: email,
    });
  }

  return { enquiryId: enquiry.id, submissionId };
}
