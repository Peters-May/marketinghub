import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireAdmin } from "@/lib/api";
import { sendTestEmail } from "@/lib/email/send-campaign";
import { getEmailCampaign, updateEmailCampaign } from "@/lib/data/repos";
import { sendCampaignWorkflow } from "@/workflows/email-campaign";
import { start } from "workflow/api";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const { error, user } = await requireAdmin();
  if (error) return error;

  const body = await request.json();
  if (body.test) {
    const result = await sendTestEmail({
      to: user.email,
      toName: user.full_name,
      fromName: String(body.from_name ?? ""),
      fromEmail: String(body.from_email ?? ""),
      subject: String(body.subject ?? ""),
      html: String(body.html_body ?? ""),
      campaignId: typeof body.campaign_id === "string" ? body.campaign_id : "",
    });
    if (!result.ok) return jsonError(result.error || "Test send failed", 502);
    return jsonOk({ ok: true, to: user.email });
  }

  const campaignId = body.campaign_id as string | undefined;
  if (!campaignId) return jsonError("campaign_id required", 400);

  const campaign = await getEmailCampaign(campaignId);
  if (!campaign) return jsonError("Not found", 404);

  if (campaign.status === "sent") {
    return jsonError("Campaign already sent", 409);
  }
  if (campaign.status === "sending") {
    return jsonOk({ ok: true, background: true });
  }

  await updateEmailCampaign(campaignId, {
    status: "sending",
    scheduled_at: null,
    last_error: "",
  });
  const run = await start(sendCampaignWorkflow, [campaignId, true]);
  console.log("[email] campaign workflow", campaignId, run.runId);
  return jsonOk({ ok: true, background: true, runId: run.runId });
}
