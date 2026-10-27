import { sleep } from "workflow";

const BATCH_GUARD = 400;

/** `claim` comes from claimEmailCampaignSend. The run stops if it loses it. */
export async function sendCampaignWorkflow(campaignId: string, claim: string) {
  "use workflow";
  console.log("[workflow] campaign send start", campaignId);

  await refreshPortalAudience();
  const prepared = await prepareCampaign(campaignId, claim);
  if (!prepared.ready) {
    console.log("[workflow] campaign send skipped", campaignId, prepared.result.error);
    return prepared.result;
  }

  const errors: string[] = [];
  let guard = 0;
  while (guard < BATCH_GUARD) {
    guard += 1;
    const batch = await sendCampaignBatch(campaignId, claim);
    errors.push(...batch.errors);
    console.log("[workflow] campaign batch", campaignId, {
      sent: batch.sent,
      failed: batch.failed,
      remaining: batch.remaining,
      stopped: batch.stopped,
    });
    if (batch.stopped || batch.remaining <= 0) break;
    await sleep("1s");
  }

  const finished = await finishCampaign(campaignId, claim, errors.slice(0, 5));
  console.log("[workflow] campaign send finished", campaignId, finished.sent, finished.failed);
  return finished;
}

async function refreshPortalAudience() {
  "use step";
  console.log("[workflow] refresh portal audience");
  const { syncPortalMarketingAudience } = await import("@/lib/sync/portal-marketing");
  try {
    await syncPortalMarketingAudience({ includeLists: false });
  } catch (err) {
    console.error("[workflow] portal audience", err);
  }
}

async function prepareCampaign(campaignId: string, claim: string) {
  "use step";
  console.log("[workflow] prepare campaign", campaignId);
  const { prepareCampaignSend } = await import("@/lib/email/send-campaign");
  return prepareCampaignSend(campaignId, String(claim ?? ""), { skipPortalSync: true });
}

async function sendCampaignBatch(campaignId: string, claim: string) {
  "use step";
  console.log("[workflow] send batch", campaignId);
  const { deliverNextCampaignBatch } = await import("@/lib/email/send-campaign");
  return deliverNextCampaignBatch(campaignId, String(claim ?? ""));
}

async function finishCampaign(campaignId: string, claim: string, errors: string[]) {
  "use step";
  console.log("[workflow] finish campaign", campaignId);
  const { finishCampaignSend } = await import("@/lib/email/send-campaign");
  return finishCampaignSend(campaignId, String(claim ?? ""), errors);
}
