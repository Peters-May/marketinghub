import type { EmailCampaign } from "@/lib/types";

/** "Copy of Asia to Americas", without stacking the prefix. */
export function copyName(name: string): string {
  const trimmed = name.trim() || "Untitled email";
  const base = trimmed.replace(/^(Copy of )+/i, "");
  return `Copy of ${base}`;
}

export function campaignCloneInput(
  existing: EmailCampaign,
  createdBy: string
) {
  return {
    title: copyName(existing.title),
    status: "draft" as const,
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
    recipient_ids: existing.recipient_ids,
    brief: existing.brief,
    hubspot_url: existing.hubspot_url,
    theme_id: existing.theme_id,
    content_id: existing.content_id,
    folder: existing.folder,
    follow_up_of: null,
    adj_open_rate: null,
    adj_click_rate: null,
    scheduled_at: null,
    sent_at: null,
    last_error: "",
    created_by: createdBy,
  };
}
