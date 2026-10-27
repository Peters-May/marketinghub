import { isPitchCampaign } from "@/lib/email/category";
import type { ContentItem, EmailCampaign, EventContentLink, EventItem, QuarterlyTheme } from "@/lib/types";

export type EmailOverviewRow = {
  id: string;
  title: string;
  status: string;
  theme: string | null;
  content: string | null;
  event: string | null;
  href: string;
};

export function buildEmailOverview(input: {
  campaigns: EmailCampaign[];
  themes: QuarterlyTheme[];
  content: ContentItem[];
  events: EventItem[];
  links: EventContentLink[];
}): EmailOverviewRow[] {
  const themes = new Map(input.themes.map((theme) => [theme.id, theme.title]));
  const content = new Map(input.content.map((item) => [item.id, item.title]));
  const events = new Map(input.events.map((event) => [event.id, event.title]));
  return input.campaigns
    .filter((campaign) => !isPitchCampaign(campaign))
    .sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""))
    .slice(0, 8)
    .map((campaign) => {
      const linkedEventId =
        campaign.event_id ||
        input.links.find((link) => link.content_id === campaign.content_id)?.event_id ||
        null;
      return {
        id: campaign.id,
        title: campaign.title,
        status: campaign.status,
        theme: campaign.theme_id ? themes.get(campaign.theme_id) ?? null : null,
        content: campaign.content_id ? content.get(campaign.content_id) ?? null : null,
        event: linkedEventId ? events.get(linkedEventId) ?? null : null,
        href: `/app/email?campaign=${encodeURIComponent(campaign.id)}`,
      };
    });
}
