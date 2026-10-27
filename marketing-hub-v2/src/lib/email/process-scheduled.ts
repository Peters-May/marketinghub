import { listEmailCampaigns } from "@/lib/data/repos";
import { sendEmailCampaign } from "@/lib/email/send-campaign";
import { sendLockExpired } from "@/lib/email/send-lock";

/**
 * Send campaigns whose scheduled time has passed.
 * A send that stopped halfway is picked up again after the lock expires.
 */
export async function listDueCampaignIds(
  limit = 1,
  opts?: { resumeInterrupted?: boolean }
): Promise<string[]> {
  const now = Date.now();
  const resumeInterrupted = opts?.resumeInterrupted !== false;
  return (await listEmailCampaigns())
    .filter((c) => {
      const scheduledDue =
        Boolean(c.scheduled_at) && new Date(c.scheduled_at as string).getTime() <= now;
      if (c.status === "scheduled" && scheduledDue) return true;
      if (!resumeInterrupted || c.status !== "sending") return false;
      return sendLockExpired(c, now);
    })
    .slice(0, limit)
    .map((c) => c.id);
}

export async function processDueScheduledCampaigns(
  limit = 1,
  opts?: { resumeInterrupted?: boolean }
): Promise<{
  processed: number;
  ids: string[];
}> {
  const due = await listDueCampaignIds(limit, opts);
  const ids: string[] = [];
  for (const id of due) {
    const result = await sendEmailCampaign(id);
    if (result.campaign) ids.push(id);
  }
  return { processed: ids.length, ids };
}
