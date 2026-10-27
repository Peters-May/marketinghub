import { claimEmailCampaignSend } from "@/lib/data/repos";
import { listDueCampaignIds } from "@/lib/email/process-scheduled";
import { sendCampaignWorkflow } from "@/workflows/email-campaign";
import { start } from "workflow/api";

/** Queue due campaigns. Each send continues in its own workflow run. */
export async function queueDueCampaignSends(
  limit = 1,
  opts?: { resumeInterrupted?: boolean }
) {
  const ids = await listDueCampaignIds(limit, opts);
  const runIds: string[] = [];
  for (const id of ids) {
    // Page loads, the campaigns API and the cron all call this. Only the
    // caller that wins the claim starts a run.
    const claim = await claimEmailCampaignSend(id, {
      from: opts?.resumeInterrupted === false ? ["scheduled"] : ["scheduled", "sending"],
      dueOnly: true,
    });
    if (!claim) continue;
    const run = await start(sendCampaignWorkflow, [id, claim]);
    runIds.push(run.runId);
    console.log("[workflow] queued campaign", id, run.runId);
  }
  return { processed: runIds.length, ids, runIds };
}
