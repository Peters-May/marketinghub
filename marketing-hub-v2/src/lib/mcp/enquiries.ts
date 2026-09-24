import {
  createWhatsAppHubEnquiry,
  listHubEnquiries,
  updateWhatsAppHubEnquiry,
  whatsappToHubEnquiry,
} from "@/lib/data/hub-enquiries";
import {
  getWhatsAppEnquiry,
  type WhatsAppEnquiryInput,
} from "@/lib/data/whatsapp-enquiries";
import { getEnquiryAttribution } from "@/lib/data/web-enquiries-stats";
import type { EnquiryIntake, HubEnquiry } from "@/lib/types";

/** Match listHubEnquiries ceiling — enough for a full calendar year of enquiries. */
const MCP_ENQUIRY_FETCH_CAP = 20_000;

export type EnquirySummary = {
  id: string;
  external_id: string;
  channel: EnquiryIntake;
  status: string;
  tracker_status: string;
  customer_name: string;
  company: string;
  customer_phone: string;
  customer_email: string;
  category: string;
  enquiry_type: string;
  vessel_cargo: string;
  collection_location: string;
  delivery_location: string;
  dimensions: string;
  declared_value: string;
  preferred_timeframe: string;
  selected_office: string;
  sent_to_office_at: string | null;
  follow_up_at: string | null;
  email_subject: string;
  /** Tracker source when set (WhatsApp). Otherwise the Hub marketing label. */
  source: string;
  /** Same label as the Enquiries screen (Google Ads, Organic search, …). */
  marketing_source: string;
  is_google_ads: boolean;
  gclid: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_term: string;
  utm_content: string;
  /** Google Ads campaign name, or Campaign {hsa_cam} when the name is missing. */
  campaign: string;
  heard_about: string;
  page_url: string;
  referrer: string;
  message: string;
  notes: string;
  created_at: string | null;
  received_at: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback = ""): string {
  if (value == null) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return fallback;
}

function enquiryMessage(e: HubEnquiry): string {
  const raw = asRecord(e.raw_payload);
  if (asString(raw.message)) return asString(raw.message);
  const make = asRecord(e.make_fields);
  return asString(make.message);
}

export function toEnquirySummary(e: HubEnquiry): EnquirySummary {
  const attr = getEnquiryAttribution(e);
  const trackerSource = (e.tracker_source ?? "").trim();
  return {
    id: e.id,
    external_id: e.submission_id,
    channel: e.channel,
    status: e.status,
    tracker_status: e.tracker_status ?? "",
    customer_name: e.customer_name,
    company: e.company ?? "",
    customer_phone: e.customer_phone,
    customer_email: e.customer_email,
    category: e.category ?? "",
    enquiry_type: e.final_service_category || e.user_selected_service,
    vessel_cargo: e.vessel_cargo ?? "",
    collection_location: e.collection_location,
    delivery_location: e.delivery_location,
    dimensions: e.dimensions ?? "",
    declared_value: e.declared_value ?? "",
    preferred_timeframe: e.preferred_timeframe ?? "",
    selected_office: e.selected_office,
    sent_to_office_at: e.sent_to_office_at ?? e.created_at,
    follow_up_at: e.follow_up_at ?? null,
    email_subject: e.email_subject ?? "",
    source: trackerSource || attr.sourceLabel,
    marketing_source: attr.sourceLabel,
    is_google_ads: attr.isGoogleAds,
    gclid: attr.gclid,
    utm_source: attr.utmSource,
    utm_medium: attr.utmMedium,
    utm_campaign: attr.utmCampaign,
    utm_term: attr.utmTerm,
    utm_content: attr.utmContent,
    campaign: attr.adsGroupLabel,
    heard_about: attr.heardAbout,
    page_url: attr.pageUrl,
    referrer: attr.referrer,
    message: enquiryMessage(e),
    notes: e.routing_reason,
    created_at: e.created_at,
    received_at: e.received_at,
  };
}

const trackerFields = {
  external_id: true,
  sent_to_office_at: true,
  follow_up_at: true,
  customer_name: true,
  company: true,
  customer_phone: true,
  customer_email: true,
  customer_country: true,
  category: true,
  enquiry_type: true,
  service: true,
  vessel_cargo: true,
  collection_location: true,
  delivery_location: true,
  dimensions: true,
  declared_value: true,
  preferred_timeframe: true,
  selected_office: true,
  office_email: true,
  tracker_status: true,
  email_subject: true,
  source: true,
  message: true,
  notes: true,
  is_test: true,
} as const;

export async function createWhatsAppEnquiryFromMcp(
  input: WhatsAppEnquiryInput
): Promise<EnquirySummary> {
  const item = await createWhatsAppHubEnquiry(input);
  return toEnquirySummary(item);
}

export async function updateWhatsAppEnquiryFromMcp(
  input: WhatsAppEnquiryInput & { id?: string; external_id?: string }
): Promise<EnquirySummary> {
  const item = await updateWhatsAppHubEnquiry(input);
  if (!item) {
    throw new Error(
      `WhatsApp enquiry not found (${input.external_id || input.id || "missing id"})`
    );
  }
  return toEnquirySummary(item);
}

function enquiryYear(e: HubEnquiry): number | null {
  const raw = e.sent_to_office_at ?? e.created_at ?? e.received_at;
  const t = new Date(raw).getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t).getFullYear();
}

export async function listEnquiriesForMcp(input: {
  channel?: EnquiryIntake;
  include_test?: boolean;
  /** Calendar year (default: current year). Pass null to skip year filter. */
  year?: number | null;
  /** Optional cap after year filter. Omit for all rows in scope. */
  limit?: number;
}): Promise<EnquirySummary[]> {
  const year =
    input.year === null
      ? null
      : input.year ?? new Date().getFullYear();

  let items = await listHubEnquiries({
    channel: input.channel,
    includeTest: Boolean(input.include_test),
  });

  if (year != null) {
    items = items.filter((e) => enquiryYear(e) === year);
  }

  if (input.limit != null) {
    const limit = Math.min(Math.max(input.limit, 1), MCP_ENQUIRY_FETCH_CAP);
    items = items.slice(0, limit);
  }

  return items.map(toEnquirySummary);
}

export async function getEnquiryForMcp(
  id: string
): Promise<EnquirySummary | null> {
  const needle = id.trim();
  if (!needle) return null;

  const looksExternal = /^WA-/i.test(needle);
  const direct = await getWhatsAppEnquiry(
    looksExternal ? { external_id: needle } : { id: needle }
  );
  if (direct) return toEnquirySummary(whatsappToHubEnquiry(direct));

  const alt = await getWhatsAppEnquiry(
    looksExternal ? { id: needle } : { external_id: needle }
  );
  if (alt) return toEnquirySummary(whatsappToHubEnquiry(alt));

  // Web / older rows: scan full store (not year-capped) so fetch always works.
  const items = await listEnquiriesForMcp({
    include_test: true,
    year: null,
  });
  return (
    items.find((item) => item.id === needle || item.external_id === needle) ??
    null
  );
}

export { trackerFields };
