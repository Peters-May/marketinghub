import { listWebEnquiries } from "@/lib/data/web-enquiries";
import {
  listWhatsAppEnquiries,
  type WhatsAppEnquiryInput,
  type WhatsAppEnquiryPatch,
  updateWhatsAppEnquiry,
  upsertWhatsAppEnquiry,
} from "@/lib/data/whatsapp-enquiries";
import type {
  EnquiryIntake,
  HubEnquiry,
  WhatsAppEnquiry,
  WebEnquiry,
} from "@/lib/types";

function isWebsiteChatEnquiry(e: WebEnquiry): boolean {
  const raw = e.raw_payload ?? {};
  const make = e.make_fields ?? {};
  const channel = String(raw.channel ?? "").toLowerCase();
  const source = String(raw.source ?? make.source ?? "").toLowerCase();
  const heard = String(make.heard_about ?? "").toLowerCase();
  return (
    channel === "website_chat" ||
    source === "website_chat" ||
    heard === "website chat" ||
    String(e.submission_id ?? "").startsWith("chat:")
  );
}

export function webToHubEnquiry(e: WebEnquiry): HubEnquiry {
  return {
    ...e,
    channel: isWebsiteChatEnquiry(e) ? "website_chat" : "web",
  };
}

export function whatsappToHubEnquiry(e: WhatsAppEnquiry): HubEnquiry {
  return {
    id: e.id,
    submission_id: e.external_id,
    channel: "whatsapp",
    created_at: e.sent_to_office_at ?? e.created_at,
    customer_name: e.customer_name,
    customer_email: e.customer_email,
    customer_phone: e.customer_phone,
    customer_country: e.customer_country,
    final_service_category: e.service,
    user_selected_service: e.service,
    collection_location: e.collection_location,
    delivery_location: e.delivery_location,
    selected_office: e.selected_office,
    office_email: e.office_email,
    needs_manual_review: e.needs_manual_review,
    marketing_emails_consent: false,
    routing_reason: e.notes || (e.message ? "WhatsApp enquiry" : ""),
    is_test: e.is_test,
    status: e.status,
    make_fields: {
      source: "whatsapp",
      message: e.message,
      notes: e.notes,
      company: e.company,
      category: e.category,
      vessel_cargo: e.vessel_cargo,
      dimensions: e.dimensions,
      declared_value: e.declared_value,
      preferred_timeframe: e.preferred_timeframe,
      tracker_status: e.tracker_status,
      email_subject: e.email_subject,
    },
    raw_payload: {
      ...e.raw_payload,
      channel: "whatsapp",
      message: e.message,
      notes: e.notes,
      vessel_cargo: e.vessel_cargo,
    },
    received_at: e.received_at,
    updated_at: e.updated_at,
    company: e.company,
    category: e.category,
    vessel_cargo: e.vessel_cargo,
    dimensions: e.dimensions,
    declared_value: e.declared_value,
    preferred_timeframe: e.preferred_timeframe,
    tracker_status: e.tracker_status,
    follow_up_at: e.follow_up_at,
    sent_to_office_at: e.sent_to_office_at,
    email_subject: e.email_subject,
    tracker_source: e.source,
  };
}

function sortHub(items: HubEnquiry[]): HubEnquiry[] {
  return [...items].sort((a, b) => {
    const ta = new Date(
      a.sent_to_office_at ?? a.created_at ?? a.received_at
    ).getTime();
    const tb = new Date(
      b.sent_to_office_at ?? b.created_at ?? b.received_at
    ).getTime();
    return tb - ta;
  });
}

/** Combined web + WhatsApp + website chat list for the Enquiries tab. */
export async function listHubEnquiries(options?: {
  includeTest?: boolean;
  channel?: EnquiryIntake;
  limit?: number;
}): Promise<HubEnquiry[]> {
  const includeTest = Boolean(options?.includeTest);
  const channel = options?.channel;

  const needWeb =
    !channel || channel === "web" || channel === "website_chat";
  const needWhatsApp = !channel || channel === "whatsapp";

  const [web, whatsapp] = await Promise.all([
    needWeb
      ? listWebEnquiries({ includeTest })
      : Promise.resolve([] as WebEnquiry[]),
    needWhatsApp
      ? listWhatsAppEnquiries({ includeTest })
      : Promise.resolve([] as WhatsAppEnquiry[]),
  ]);

  let merged = sortHub([
    ...web.map(webToHubEnquiry),
    ...whatsapp.map(whatsappToHubEnquiry),
  ]);

  if (channel) {
    merged = merged.filter((e) => e.channel === channel);
  }

  if (options?.limit != null) {
    const limit = Math.min(Math.max(options.limit, 1), 20_000);
    merged = merged.slice(0, limit);
  }

  return merged;
}

export async function createWhatsAppHubEnquiry(
  input: WhatsAppEnquiryInput
): Promise<HubEnquiry> {
  const item = await upsertWhatsAppEnquiry(input);
  return whatsappToHubEnquiry(item);
}

export async function updateWhatsAppHubEnquiry(
  patch: WhatsAppEnquiryPatch
): Promise<HubEnquiry | null> {
  const item = await updateWhatsAppEnquiry(patch);
  return item ? whatsappToHubEnquiry(item) : null;
}
