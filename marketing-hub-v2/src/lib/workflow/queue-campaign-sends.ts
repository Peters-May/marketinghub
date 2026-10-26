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
    const run = await start(sendCampaignWorkflow, [id, false]);
    runIds.push(run.runId);
    console.log("[workflow] queued campaign", id, run.runId);
  }
  return { processed: ids.length, ids, runIds };
}
