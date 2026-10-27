import { redirect } from "next/navigation";
import { EmailMarketingHub } from "@/components/email/EmailMarketingHub";
import { allowDemoAuth, DEMO_STAFF } from "@/lib/auth/config";
import { getSessionUser } from "@/lib/auth/session";
import { queueDueCampaignSends } from "@/lib/workflow/queue-campaign-sends";
import {
  listContent,
  listEmailAudiences,
  listEmailCampaigns,
  listEmailTemplates,
  listMediaLists,
  resolveEmailRecipients,
} from "@/lib/data/repos";
import {
  isMarketingInboxCampaign,
  isPitchTabCampaign,
} from "@/lib/email/category";

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

  const [campaigns, templates, audiences, lists, content] = await Promise.all([
    listEmailCampaigns(),
    listEmailTemplates(),
    listEmailAudiences(),
    listMediaLists(),
    listContent(),
  ]);
  const marketingCampaigns = campaigns.filter(isMarketingInboxCampaign);
  const pitchCampaigns = campaigns.filter(isPitchTabCampaign);

  const audiencesWithCounts = await Promise.all(
    audiences.map(async (a) => {
      const recipients = await resolveEmailRecipients({ audienceId: a.id });
      return { ...a, recipient_count: recipients.length };
    })
  );

  const marketingLists = lists.filter(
    (l) => l.list_kind === "marketing" || l.list_kind === "mixed"
  );

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
      content={content}
      initialTemplates={templates}
      initialAudiences={audiencesWithCounts}
      initialLists={marketingLists}
      initialTab={tab}
    />
  );
}
