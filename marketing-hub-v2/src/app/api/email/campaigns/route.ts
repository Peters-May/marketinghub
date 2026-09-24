import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireAdmin } from "@/lib/api";
import {
  createEmailCampaign,
  deleteEmailCampaign,
  listContent,
  listEmailAudiences,
  listEmailCampaigns,
  listEmailTemplates,
  listMediaLists,
  listThemes,
  resolveEmailRecipients,
  updateEmailCampaign,
} from "@/lib/data/repos";
import { processDueScheduledCampaigns } from "@/lib/email/process-scheduled";
import type { EmailCampaignStatus } from "@/lib/types";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  // Fire due scheduled sends (best-effort; does not block listing on failure)
  try {
    await processDueScheduledCampaigns(3);
  } catch (err) {
    console.error("[api/email/campaigns] processDue failed", err);
  }

  const [campaigns, templates, audiences, lists, themes, content] =
    await Promise.all([
      listEmailCampaigns(),
      listEmailTemplates(),
      listEmailAudiences(),
      listMediaLists(),
      listThemes(),
      listContent(),
    ]);
  return jsonOk({
    campaigns,
    templates,
    audiences,
    lists: lists.filter(
      (l) => l.list_kind === "marketing" || l.list_kind === "mixed"
    ),
    themes,
    content: content.filter(
      (c) =>
        (c.content_type ?? "").toLowerCase().includes("newsletter") ||
        (c.channel ?? []).some((ch) =>
          String(ch).toLowerCase().includes("newsletter")
        )
    ),
  });
}

export async function POST(request: NextRequest) {
  const { error, user } = await requireAdmin();
  if (error) return error;
  const body = await request.json();
  const action = body.action as string | undefined;

  if (action === "update") {
    const item = await updateEmailCampaign(body.id, body.patch ?? {});
    if (!item) return jsonError("Not found", 404);
    return jsonOk({ item });
  }

  if (action === "delete") {
    await deleteEmailCampaign(body.id);
    return jsonOk({ ok: true });
  }

  if (action === "schedule") {
    const scheduledAt = body.scheduled_at as string | undefined;
    if (!scheduledAt) return jsonError("scheduled_at required", 400);
    const item = await updateEmailCampaign(body.id, {
      status: "scheduled" as EmailCampaignStatus,
      scheduled_at: scheduledAt,
      last_error: "",
    });
    if (!item) return jsonError("Not found", 404);
    return jsonOk({ item });
  }

  if (action === "cancel") {
    const item = await updateEmailCampaign(body.id, {
      status: "cancelled",
      scheduled_at: null,
    });
    if (!item) return jsonError("Not found", 404);
    return jsonOk({ item });
  }

  if (action === "preview_recipients") {
    const count = (
      await resolveEmailRecipients({
        audienceId: body.audience_id,
        listIds: body.list_ids,
        recipientIds: body.recipient_ids,
      })
    ).length;
    return jsonOk({ count });
  }

  const createdBy = user?.email || user?.id || body.created_by || "";

  const item = await createEmailCampaign({
    title: body.title ?? "Untitled campaign",
    status: "draft",
    subject: body.subject ?? "",
    preview_text: body.preview_text ?? "",
    from_name: body.from_name ?? "Peters & May Marketing",
    from_email: body.from_email ?? "marketing@petersandmay.com",
    html_body: body.html_body ?? "",
    template_id: body.template_id || null,
    audience_id: body.audience_id || null,
    list_ids: Array.isArray(body.list_ids) ? body.list_ids : [],
    recipient_ids: Array.isArray(body.recipient_ids) ? body.recipient_ids : [],
    brief: body.brief ?? "",
    hubspot_url: body.hubspot_url ?? "",
    theme_id: body.theme_id || null,
    content_id: body.content_id || null,
    scheduled_at: body.scheduled_at || null,
    sent_at: null,
    last_error: "",
    created_by: createdBy,
  });
  return jsonOk({ item }, { status: 201 });
}
