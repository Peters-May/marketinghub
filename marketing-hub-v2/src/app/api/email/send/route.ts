import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireStaff } from "@/lib/api";
import { sendEmailCampaign } from "@/lib/email/send-campaign";
import { getEmailCampaign, updateEmailCampaign } from "@/lib/data/repos";

export async function POST(request: NextRequest) {
  const { error } = await requireStaff();
  if (error) return error;

  const body = await request.json();
  const campaignId = body.campaign_id as string | undefined;
  if (!campaignId) return jsonError("campaign_id required", 400);

  const campaign = await getEmailCampaign(campaignId);
  if (!campaign) return jsonError("Not found", 404);

  // Allow immediate send from draft/scheduled/failed/cancelled
  if (campaign.status === "sending") {
    return jsonError("Campaign is already sending", 409);
  }
  if (campaign.status === "sent") {
    return jsonError("Campaign already sent", 409);
  }

  // Clear schedule when sending now
  if (campaign.status === "scheduled") {
    await updateEmailCampaign(campaignId, { scheduled_at: null });
  }

  const result = await sendEmailCampaign(campaignId);
  if (!result.ok) {
    return jsonError(result.error || "Send failed", 502, {
      campaign: result.campaign,
      sent: result.sent,
      failed: result.failed,
    });
  }
  return jsonOk({
    campaign: result.campaign,
    sent: result.sent,
    failed: result.failed,
  });
}
