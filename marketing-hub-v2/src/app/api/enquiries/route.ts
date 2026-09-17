import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireAdmin, requireStaff } from "@/lib/api";
import { listHubEnquiries } from "@/lib/data/hub-enquiries";
import {
  deleteWebEnquiry,
  requireWebhookSecret,
  updateWebEnquiry,
  upsertWebEnquiryFromWebhook,
} from "@/lib/data/web-enquiries";
import {
  deleteWhatsAppEnquiry,
  updateWhatsAppEnquiry,
} from "@/lib/data/whatsapp-enquiries";
import type { EnquiryIntake, WebEnquiryStatus } from "@/lib/types";
import { hasServiceRoleKey } from "@/lib/supabase/admin";
import { rateLimitPublic } from "@/lib/security/rate-limit";
import { syncWebEnquiryToPortal } from "@/lib/sync/portal-enquiries";

/**
 * Staff list: GET with session — web + WhatsApp merged.
 * Webhook ingest: POST with X-Webhook-Secret / Bearer (no session) — web only.
 * Staff mutations: POST with session + action update|delete (delete = admin only).
 */
export async function GET(request: NextRequest) {
  const { error } = await requireStaff();
  if (error) return error;

  if (!hasServiceRoleKey()) {
    return jsonOk({ enquiries: [], configured: false });
  }

  const includeTest =
    request.nextUrl.searchParams.get("include_test") === "1" ||
    request.nextUrl.searchParams.get("include_test") === "true";
  const channelRaw = request.nextUrl.searchParams.get("channel");
  const channel =
    channelRaw === "web" || channelRaw === "whatsapp"
      ? (channelRaw as EnquiryIntake)
      : undefined;
  const limitRaw = request.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;

  try {
    const enquiries = await listHubEnquiries({
      includeTest,
      channel,
      ...(Number.isFinite(limit) ? { limit } : {}),
    });
    return jsonOk({ enquiries, configured: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list";
    return jsonError(message, 500);
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body || typeof body !== "object") {
    return jsonError("JSON body required");
  }

  const action = typeof body.action === "string" ? body.action : undefined;

  // Staff mutations (session auth) — delete is admin-only
  if (action === "update" || action === "delete") {
    const gate = action === "delete" ? await requireAdmin() : await requireStaff();
    if (gate.error) return gate.error;

    if (!hasServiceRoleKey()) {
      return jsonError("Enquiries storage is not configured", 503);
    }

    const channel =
      body.channel === "whatsapp" ? "whatsapp" : ("web" as EnquiryIntake);

    try {
      if (action === "delete") {
        const id = String(body.id ?? "");
        if (!id) return jsonError("id is required");
        if (channel === "whatsapp") {
          await deleteWhatsAppEnquiry(id);
        } else {
          await deleteWebEnquiry(id);
        }
        return jsonOk({ ok: true });
      }

      const id = String(body.id ?? "");
      if (!id) return jsonError("id is required");
      const patch =
        body.patch && typeof body.patch === "object"
          ? (body.patch as { status?: WebEnquiryStatus })
          : {};
      const status = patch.status ?? (body.status as WebEnquiryStatus | undefined);
      const updated =
        channel === "whatsapp"
          ? await updateWhatsAppEnquiry({ id, status })
          : await updateWebEnquiry(id, { status });
      if (!updated) return jsonError("Not found", 404);
      return jsonOk({ item: updated });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Update failed";
      return jsonError(message, 500);
    }
  }

  // Webhook ingest (secret auth — WordPress Quote Builder)
  const limited = rateLimitPublic(request, "web-enquiry-webhook", 60);
  if (!limited.ok) return limited.response;

  if (!requireWebhookSecret(request)) {
    return jsonError("Unauthorized", 401);
  }

  if (!hasServiceRoleKey()) {
    return jsonError("Enquiries storage is not configured", 503);
  }

  try {
    const item = await upsertWebEnquiryFromWebhook(body);
    // Hub remains SoT: ingest succeeds even when Portal sync fails.
    const portal_sync = await syncWebEnquiryToPortal(body);
    return jsonOk({
      ok: true,
      id: item.id,
      submission_id: item.submission_id,
      portal_sync,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ingest failed";
    const status = message.includes("submission_id") ? 400 : 500;
    return jsonError(message, status);
  }
}
