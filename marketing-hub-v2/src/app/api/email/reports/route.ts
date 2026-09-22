import { NextRequest } from "next/server";
import { jsonOk, requireStaff } from "@/lib/api";
import {
  listEmailCampaigns,
  listEmailEvents,
} from "@/lib/data/repos";

export async function GET(request: NextRequest) {
  const { error } = await requireStaff();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get("campaign_id");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const [campaigns, events] = await Promise.all([
    listEmailCampaigns(),
    listEmailEvents(campaignId || undefined),
  ]);

  const fromMs = from ? new Date(from).getTime() : null;
  const toMs = to ? new Date(to).getTime() : null;

  const filteredCampaigns = campaigns.filter((c) => {
    if (campaignId && c.id !== campaignId) return false;
    const ref = c.sent_at || c.scheduled_at || c.updated_at;
    const t = new Date(ref).getTime();
    if (fromMs !== null && Number.isFinite(fromMs) && t < fromMs) return false;
    if (toMs !== null && Number.isFinite(toMs) && t > toMs) return false;
    return true;
  });

  const rollup = {
    campaigns: filteredCampaigns.length,
    recipients: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    bounced: 0,
    complained: 0,
    unsubscribed: 0,
  };

  for (const c of filteredCampaigns) {
    rollup.recipients += c.stats.recipients || 0;
    rollup.delivered += c.stats.delivered || 0;
    rollup.opened += c.stats.opened || 0;
    rollup.clicked += c.stats.clicked || 0;
    rollup.bounced += c.stats.bounced || 0;
    rollup.complained += c.stats.complained || 0;
    rollup.unsubscribed += c.stats.unsubscribed || 0;
  }

  const filteredEvents = events.filter((e) => {
    if (campaignId && e.campaign_id !== campaignId) return false;
    const t = new Date(e.created_at).getTime();
    if (fromMs !== null && Number.isFinite(fromMs) && t < fromMs) return false;
    if (toMs !== null && Number.isFinite(toMs) && t > toMs) return false;
    return true;
  });

  return jsonOk({
    rollup,
    campaigns: filteredCampaigns.map((c) => ({
      id: c.id,
      title: c.title,
      status: c.status,
      sent_at: c.sent_at,
      scheduled_at: c.scheduled_at,
      stats: c.stats,
      open_rate:
        c.stats.delivered > 0
          ? Math.round((c.stats.opened / c.stats.delivered) * 1000) / 10
          : null,
      click_rate:
        c.stats.delivered > 0
          ? Math.round((c.stats.clicked / c.stats.delivered) * 1000) / 10
          : null,
    })),
    events: filteredEvents.slice(0, 200),
  });
}
