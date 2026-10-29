import { PRESS_PITCH_TEMPLATE_ID } from "@/lib/pr/pitch-email";
import type { EmailCampaignCategory } from "@/lib/types";

/** Stored category wins. Older rows are pitches when they use the press layout. */
export function emailCampaignCategory(campaign: {
  category?: string | null;
  folder?: string | null;
  template_id?: string | null;
}): EmailCampaignCategory {
  if (campaign.category === "pitch" || campaign.category === "marketing") {
    return campaign.category;
  }
  if (
    campaign.folder === "Press" ||
    campaign.template_id === PRESS_PITCH_TEMPLATE_ID
  ) {
    return "pitch";
  }
  return "marketing";
}

export function isPitchCampaign(campaign: {
  category?: string | null;
  folder?: string | null;
  template_id?: string | null;
}): boolean {
  return emailCampaignCategory(campaign) === "pitch";
}

/** Imported press sends from the release library, not marketing newsletters. */
export function isReleaseLibraryCampaign(campaign: { id?: string | null }): boolean {
  return (campaign.id ?? "").startsWith("ecamp_rel_");
}

/** Email → Pitches. Real pitches, plus imported press sends. */
export function isPitchTabCampaign(campaign: {
  id?: string | null;
  category?: string | null;
  folder?: string | null;
  template_id?: string | null;
}): boolean {
  return isPitchCampaign(campaign) || isReleaseLibraryCampaign(campaign);
}

/** Email → Emails. Newsletters and announcements only. */
export function isMarketingInboxCampaign(campaign: {
  id?: string | null;
  category?: string | null;
  folder?: string | null;
  template_id?: string | null;
}): boolean {
  return !isPitchTabCampaign(campaign);
}

/** Members may open a marketing email after it has been sent. */
export function isMemberVisibleCampaign(campaign: {
  id?: string | null;
  category?: string | null;
  folder?: string | null;
  template_id?: string | null;
  status?: string | null;
}): boolean {
  return (
    isMarketingInboxCampaign(campaign) &&
    (campaign.status === "sent" || campaign.status === "sending")
  );
}

/** Where Back should land after editing or viewing a campaign. */
export function emailCampaignHome(campaign: {
  id?: string | null;
  category?: string | null;
  folder?: string | null;
  template_id?: string | null;
}): string {
  if (isPitchCampaign(campaign)) return "/app/pr/emails";
  if (isReleaseLibraryCampaign(campaign)) return "/app/email?tab=pitches";
  return "/app/email";
}
