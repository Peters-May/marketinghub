import { redirect } from "next/navigation";
import { EmailMarketingHub } from "@/components/email/EmailMarketingHub";
import { allowDemoAuth, DEMO_STAFF } from "@/lib/auth/config";
import { getSessionUser } from "@/lib/auth/session";
import { processDueScheduledCampaigns } from "@/lib/email/process-scheduled";
import {
  listEmailAudiences,
  listEmailCampaigns,
  listEmailTemplates,
  listMediaLists,
  resolveEmailRecipients,
} from "@/lib/data/repos";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
    await processDueScheduledCampaigns(1);
  } catch (err) {
    console.error("[email] scheduled send", err);
  }

  const [campaigns, templates, audiences, lists] = await Promise.all([
    listEmailCampaigns(),
    listEmailTemplates(),
    listEmailAudiences(),
    listMediaLists(),
  ]);

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
    searchParams?.tab === "templates"
      ? "templates"
      : searchParams?.tab === "analyse"
        ? "analyse"
        : undefined;

  return (
    <EmailMarketingHub
      initialCampaigns={campaigns}
      initialTemplates={templates}
      initialAudiences={audiencesWithCounts}
      initialLists={marketingLists}
      initialTab={tab}
    />
  );
}
