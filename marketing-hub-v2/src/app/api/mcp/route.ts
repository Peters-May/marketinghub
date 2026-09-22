import { createHubMcpHttpHandler } from "@/lib/mcp/http-handler";
import { registerHubMcpTools } from "@/lib/mcp/register-tools";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const handler = createHubMcpHttpHandler({
  resourcePath: "/api/mcp",
  serverInfo: {
    name: "peters-may-marketing-hub",
    version: "1.7.0",
  },
  instructions: `You are connected to the Peters & May Marketing Hub MCP (12 tools).

WhatsApp enquiry tracker (Enquiries → WhatsApp tab) — use these first for new enquiries:
- create_whatsapp_enquiry for each new WhatsApp enquiry (omit external_id to auto-allocate WA-###).
- update_whatsapp_enquiry for chase / quote / status / office updates (identify by external_id WA-###).
- list_enquiries with channel "whatsapp" returns all rows for the year (default: current year). Pass year to change; omit limit for the full year.
Fields match the Excel tracker (customer, office, vessel, status, etc.).

Social / content:
- Use get_brand_context and list_themes before drafting posts.
- Create drafts with create_social_draft; refine with update_social_post.
- Publishing happens in Planable — do not set status to published.`,
  register: registerHubMcpTools,
});

export const GET = handler.GET;
export const POST = handler.POST;
export const DELETE = handler.DELETE;
export const OPTIONS = handler.OPTIONS;
