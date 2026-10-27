import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireAdmin } from "@/lib/api";
import {
  createEmailCampaign,
  deleteEmailCampaign,
  getEmailCampaign,
  listContent,
  listEmailAudiences,
  listEmailCampaigns,
  listEmailTemplates,
  listMediaLists,
  listThemes,
  resolveEmailRecipients,
  updateEmailCampaign,
} from "@/lib/data/repos";
import { campaignCloneInput } from "@/lib/email/clone";
import { canDeleteUnsentDraft } from "@/lib/email/display";
import { queueDueCampaignSends } from "@/lib/workflow/queue-campaign-sends";
import { viewInBrowserUrlFor } from "@/lib/email/unsubscribe-token";
import type { EmailCampaignStatus } from "@/lib/types";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  // Fire due scheduled sends (best-effort; does not block listing on failure)
  try {
    await queueDueCampaignSends(3);
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
    const existing = await getEmailCampaign(String(body.id ?? ""));
    if (!existing) return jsonError("Not found", 404);
    if (!canDeleteUnsentDraft(existing)) {
      return jsonError("Only a draft that has not been sent can be deleted", 400);
    }
    await deleteEmailCampaign(existing.id);
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

  if (action === "clone") {
    const existing = await getEmailCampaign(String(body.id ?? ""));
    if (!existing) return jsonError("Not found", 404);
    const item = await createEmailCampaign(
      campaignCloneInput(existing, user?.email || user?.id || "")
    );
    return jsonOk({ item }, { status: 201 });
  }

  if (action === "follow_up") {
    const existing = await getEmailCampaign(String(body.id ?? ""));
    if (!existing) return jsonError("Not found", 404);
    const item = await createEmailCampaign({
      title: `Follow-up: ${existing.title}`,
      status: "draft",
      subject: existing.subject,
      preview_text: existing.preview_text,
      from_name: existing.from_name,
      from_email: existing.from_email,
      html_body: existing.html_body,
      design: existing.design,
      template_id: existing.template_id,
      audience_id: existing.audience_id,
      exclude_audience_id: existing.exclude_audience_id,
      list_ids: existing.list_ids,
      recipient_ids: [],
      brief: existing.brief,
      hubspot_url: existing.hubspot_url,
      theme_id: existing.theme_id,
      content_id: existing.content_id,
      folder: existing.folder,
      category: existing.category,
      follow_up_of: existing.id,
      adj_open_rate: null,
      adj_click_rate: null,
      scheduled_at: null,
      sent_at: null,
      last_error: "",
      created_by: user?.email || user?.id || "",
    });
    return jsonOk({ item }, { status: 201 });
  }

  if (action === "preview_recipients") {
    const count = (
      await resolveEmailRecipients({
        audienceId: body.audience_id,
        excludeAudienceId: body.exclude_audience_id,
        listIds: body.list_ids,
        recipientIds: body.recipient_ids,
      })
    ).length;
    return jsonOk({ count });
  }

  if (action === "preview_link") {
    const existing = await getEmailCampaign(String(body.id ?? ""));
    if (!existing) return jsonError("Not found", 404);
    if (!existing.html_body?.trim()) {
      return jsonError("Save the email before copying a preview link", 400);
    }
    const url = viewInBrowserUrlFor({
      email: "preview@petersandmay.com",
      campaignId: existing.id,
      contactId: null,
    });
    return jsonOk({ url });
  }

  const createdBy = user?.email || user?.id || body.created_by || "";

  const item = await createEmailCampaign({
    title: body.title ?? "Untitled campaign",
    status: "draft",
    subject: body.subject ?? "",
    preview_text: body.preview_text ?? "",
    from_name: body.from_name ?? "Peters & May Marketing",
    from_email: body.from_email ?? "hello@petersandmay.com",
    html_body: body.html_body ?? "",
    design: body.design ?? null,
    template_id: body.template_id || null,
    audience_id: body.audience_id || null,
    exclude_audience_id: body.exclude_audience_id || null,
    list_ids: Array.isArray(body.list_ids) ? body.list_ids : [],
    recipient_ids: Array.isArray(body.recipient_ids) ? body.recipient_ids : [],
    brief: body.brief ?? "",
    hubspot_url: body.hubspot_url ?? "",
    theme_id: body.theme_id || null,
    content_id: body.content_id || null,
    folder: typeof body.folder === "string" ? body.folder : "",
    category:
      body.category === "pitch" || body.category === "marketing"
        ? body.category
        : undefined,
    follow_up_of: null,
    adj_open_rate: null,
    adj_click_rate: null,
    scheduled_at: body.scheduled_at || null,
    sent_at: null,
    last_error: "",
    created_by: createdBy,
  });
  return jsonOk({ item }, { status: 201 });
}
