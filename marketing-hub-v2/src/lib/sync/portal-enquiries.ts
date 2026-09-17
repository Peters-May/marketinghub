import type { WhatsAppEnquiry } from "@/lib/types";

export type PortalSyncResult =
  | { ok: true; skipped?: false }
  | { ok: true; skipped: true; reason: string }
  | { ok: false; error: string; status?: number };

function portalBaseUrl(): string {
  return (process.env.PORTAL_BASE_URL ?? "").trim().replace(/\/+$/, "");
}

function portalSyncSecret(): string {
  return (process.env.PORTAL_ENQUIRY_SYNC_SECRET ?? "").trim();
}

/** True when Hub can forward enquiries to the Customer Portal. */
export function isPortalEnquirySyncConfigured(): boolean {
  return Boolean(portalBaseUrl() && portalSyncSecret());
}

async function postToPortal(
  path: string,
  body: Record<string, unknown>
): Promise<PortalSyncResult> {
  const base = portalBaseUrl();
  const secret = portalSyncSecret();
  if (!base || !secret) {
    return {
      ok: true,
      skipped: true,
      reason: "PORTAL_BASE_URL or PORTAL_ENQUIRY_SYNC_SECRET not set",
    };
  }

  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
        "X-Webhook-Secret": secret,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const error =
        text.slice(0, 400) || `Portal sync HTTP ${res.status}`;
      console.error("[portal-enquiry-sync]", path, res.status, error);
      return { ok: false, error, status: res.status };
    }
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Portal sync failed";
    console.error("[portal-enquiry-sync]", path, error);
    return { ok: false, error };
  }
}

/**
 * Forward the original WordPress / PMQB webhook body to Portal
 * `POST /api/enquiries` (idempotent on submission_id).
 */
export async function syncWebEnquiryToPortal(
  webhookBody: Record<string, unknown>
): Promise<PortalSyncResult> {
  return postToPortal("/api/enquiries", webhookBody);
}

/** Payload Portal `POST /api/enquiries/hub-sync` accepts for WhatsApp. */
export function whatsAppEnquiryToPortalSyncBody(
  enquiry: WhatsAppEnquiry
): Record<string, unknown> {
  return {
    channel: "whatsapp",
    external_id: enquiry.external_id,
    customer_name: enquiry.customer_name || null,
    company: enquiry.company || null,
    customer_email: enquiry.customer_email || null,
    customer_phone: enquiry.customer_phone || null,
    customer_country: enquiry.customer_country || null,
    category: enquiry.category || null,
    service: enquiry.service || null,
    vessel_cargo: enquiry.vessel_cargo || null,
    collection_location: enquiry.collection_location || null,
    delivery_location: enquiry.delivery_location || null,
    dimensions: enquiry.dimensions || null,
    declared_value: enquiry.declared_value || null,
    preferred_timeframe: enquiry.preferred_timeframe || null,
    selected_office: enquiry.selected_office || null,
    office_email: enquiry.office_email || null,
    tracker_status: enquiry.tracker_status || null,
    status: enquiry.status || null,
    email_subject: enquiry.email_subject || null,
    source: enquiry.source || "mcp",
    message: enquiry.message || null,
    notes: enquiry.notes || null,
    sent_to_office_at: enquiry.sent_to_office_at,
    follow_up_at: enquiry.follow_up_at,
    needs_manual_review: enquiry.needs_manual_review,
    is_test: enquiry.is_test,
    marketing_emails_consent: false,
    raw_payload: enquiry.raw_payload,
  };
}

/**
 * Mirror a Hub WhatsApp (MCP) enquiry into Portal web_enquiries
 * as submission_id `whatsapp:hub:WA-###`.
 */
export async function syncWhatsAppEnquiryToPortal(
  enquiry: WhatsAppEnquiry
): Promise<PortalSyncResult> {
  if (!enquiry.external_id?.trim()) {
    return { ok: false, error: "external_id is required for WhatsApp sync" };
  }
  return postToPortal(
    "/api/enquiries/hub-sync",
    whatsAppEnquiryToPortalSyncBody(enquiry)
  );
}
