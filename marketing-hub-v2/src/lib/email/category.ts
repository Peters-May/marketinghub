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
