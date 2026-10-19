import { listEmailCampaigns } from "@/lib/data/repos";
import { sendEmailCampaign } from "@/lib/email/send-campaign";

const SENDING_LOCK_MS = 8 * 60 * 1000;

/**
 * Send campaigns whose scheduled time has passed.
 * A send that stopped halfway is picked up again after the lock expires.
 */
export async function processDueScheduledCampaigns(limit = 1): Promise<{
  processed: number;
  ids: string[];
}> {
  const now = Date.now();
  const due = (await listEmailCampaigns())
    .filter((c) => {
      if (!c.scheduled_at || new Date(c.scheduled_at).getTime() > now) return false;
      if (c.status === "scheduled") return true;
      if (c.status !== "sending") return false;
      const started = new Date(c.updated_at).getTime();
      return now - started >= SENDING_LOCK_MS;
    })
    .slice(0, limit);

  const ids: string[] = [];
  for (const c of due) {
    const result = await sendEmailCampaign(c.id);
    if (result.campaign) ids.push(c.id);
  }
  return { processed: ids.length, ids };
}
