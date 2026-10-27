import { redirect } from "next/navigation";
import { EmailMarketingHub } from "@/components/email/EmailMarketingHub";
import { allowDemoAuth, DEMO_STAFF } from "@/lib/auth/config";
import { getSessionUser } from "@/lib/auth/session";
import { queueDueCampaignSends } from "@/lib/workflow/queue-campaign-sends";
import {
  countAudienceRecipients,
  listContentTitles,
  listEmailAudiences,
  listEmailCampaigns,
  listEmailTemplates,
  listMediaLists,
} from "@/lib/data/repos";
import { isMarketingList, toAudienceListOption } from "@/lib/email/audience-list";
import {
  isMarketingInboxCampaign,
  isPitchTabCampaign,
} from "@/lib/email/category";
import type { EmailCampaign, EmailTemplate } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export default async function EmailPage({
  searchParams,
}: {
  searchParams?: { tab?: string; campaign?: string };
}) {
  const user =
    (await getSessionUser()) ?? (allowDemoAuth() ? DEMO_STAFF : null);
  if (!user || user.role !== "admin") {
    redirect("/app");
  }

  if (searchParams?.campaign) {
    redirect(`/app/email/design/campaign/${encodeURIComponent(searchParams.campaign)}`);
  }

  try {
    await queueDueCampaignSends(1, { resumeInterrupted: false });
  } catch (err) {
    console.error("[email] scheduled send", err);
  }

  const [campaigns, templates, audiences, lists, contentTitles] = await Promise.all([
    listEmailCampaigns(),
    listEmailTemplates(),
    listEmailAudiences(),
    listMediaLists(),
    listContentTitles(),
  ]);
  const marketingCampaigns = campaigns
    .filter(isMarketingInboxCampaign)
    .map(withoutEmailDocument);
  const pitchCampaigns = campaigns
    .filter(isPitchTabCampaign)
    .map(withoutEmailDocument);
  const counts = await countAudienceRecipients(audiences.map((audience) => audience.id));
  const audiencesWithCounts = audiences.map((audience) => ({
    ...audience,
    recipient_count: counts.get(audience.id) ?? 0,
  }));
  const marketingLists = lists.filter(isMarketingList).map(toAudienceListOption);

  const tab =
    searchParams?.tab === "pitches"
      ? "pitches"
      : searchParams?.tab === "templates"
        ? "templates"
        : searchParams?.tab === "analyse"
          ? "analyse"
          : undefined;

  return (
    <EmailMarketingHub
      initialCampaigns={marketingCampaigns}
      pitchCampaigns={pitchCampaigns}
      initialTemplates={templates.map(withoutEmailDocument)}
      initialAudiences={audiencesWithCounts}
      initialLists={marketingLists}
      contentTitles={contentTitles}
      initialTab={tab}
    />
  );
}

/** The list only needs names and stats. Designs stay on the editor page. */
function withoutEmailDocument<T extends EmailCampaign | EmailTemplate>(item: T): T {
  if (!item.html_body && !item.design) return item;
  return { ...item, html_body: "", design: null };
}
