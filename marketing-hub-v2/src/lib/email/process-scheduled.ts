import { listEmailCampaigns } from "@/lib/data/repos";
import { sendEmailCampaign } from "@/lib/email/send-campaign";

/**
 * Send campaigns whose scheduled_at is due. Best-effort; safe to call on page load.
 */
export async function processDueScheduledCampaigns(limit = 3): Promise<{
  processed: number;
  ids: string[];
}> {
  const now = Date.now();
  const due = (await listEmailCampaigns())
    .filter(
      (c) =>
        c.status === "scheduled" &&
        c.scheduled_at &&
        new Date(c.scheduled_at).getTime() <= now
    )
    .slice(0, limit);

  const ids: string[] = [];
  for (const c of due) {
    const result = await sendEmailCampaign(c.id);
    if (result.campaign) ids.push(c.id);
  }
  return { processed: ids.length, ids };
}
