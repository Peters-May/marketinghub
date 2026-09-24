import { createHubMcpHttpHandler } from "@/lib/mcp/http-handler";
import { registerEnquiryMcpTools } from "@/lib/mcp/register-tools";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Dedicated ChatGPT connector for WhatsApp enquiries.
 * ChatGPT freezes the tool list when a connector is created, so new tools on
 * /api/mcp never appear. Point a new connector at this URL instead.
 */
const handler = createHubMcpHttpHandler({
  resourcePath: "/api/mcp/enquiries",
  serverInfo: {
    name: "peters-may-marketing-hub-enquiries",
    version: "1.9.0",
  },
  instructions: `You are connected to the Peters & May Marketing Hub enquiry tracker.

- search then fetch to look up existing tracker rows (searches the full calendar year by default).
- create_whatsapp_enquiry for each new WhatsApp enquiry (omit external_id to auto-allocate WA-###).
- update_whatsapp_enquiry for chase / quote / status / office updates (identify by external_id WA-###).
- list_enquiries returns all rows for the year (default: current year). Pass channel "web" or "whatsapp", and year to change scope. Omit limit for the full year.
Web rows include a tracking object copied from raw_payload.tracking (gclid, utm_source, utm_medium, utm_campaign, utm_term, utm_content, page_url, referrer). source is google_ads when gclid or another Google Ads signal is present. There is no separate raw_payload on this connector.`,
  register: registerEnquiryMcpTools,
});

export const GET = handler.GET;
export const POST = handler.POST;
export const DELETE = handler.DELETE;
export const OPTIONS = handler.OPTIONS;
