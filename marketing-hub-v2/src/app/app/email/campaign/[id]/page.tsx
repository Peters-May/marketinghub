import { notFound, redirect } from "next/navigation";
import { EmailCampaignSummary } from "@/components/email/EmailCampaignSummary";
import { allowDemoAuth, DEMO_STAFF } from "@/lib/auth/config";
import { isStaffSession } from "@/lib/auth/roles";
import { getSessionUser } from "@/lib/auth/session";
import { emailCampaignHome, isMemberVisibleCampaign } from "@/lib/email/category";
import { buildCampaignReport } from "@/lib/email/campaign-report";
import {
  getEmailCampaign,
  listContacts,
  listEmailAudiences,
  listEmailEvents,
  listEmailSuppressions,
  syncEmailCampaignStats,
} from "@/lib/data/repos";
import {
  campaignStatsFromEvents,
  emailStatsEqual,
} from "@/lib/email/stats-projector";

export const dynamic = "force-dynamic";

export default async function EmailCampaignSummaryPage({
  params,
}: {
  params: { id: string };
}) {
  const user =
    (await getSessionUser()) ?? (allowDemoAuth() ? DEMO_STAFF : null);
  if (!user || !isStaffSession(user.role)) {
    redirect("/app");
  }
  const isAdmin = user.role === "admin";

  const [campaign, audiences, events, contacts, suppressions] = await Promise.all([
    getEmailCampaign(params.id),
    listEmailAudiences(),
    listEmailEvents(params.id),
    listContacts(),
    listEmailSuppressions(),
  ]);
  if (!campaign) notFound();
  if (!isAdmin && !isMemberVisibleCampaign(campaign)) {
    redirect("/app/email");
  }
  if (isAdmin && campaign.status !== "sent" && campaign.status !== "sending") {
    redirect(`/app/email/design/campaign/${encodeURIComponent(campaign.id)}`);
  }

  const liveStats = campaignStatsFromEvents(events, campaign.stats);
  let campaignWithStats = campaign;
  if (!emailStatsEqual(liveStats, campaign.stats)) {
    const healed = await syncEmailCampaignStats(campaign.id, liveStats);
    if (healed) campaignWithStats = healed;
    else campaignWithStats = { ...campaign, stats: liveStats };
  }

  const audienceName =
    audiences.find((audience) => audience.id === campaign.audience_id)?.name ??
    "";
  const report = buildCampaignReport({
    campaign: campaignWithStats,
    events,
    contacts,
    suppressions,
  });

  return (
    <EmailCampaignSummary
      campaign={campaignWithStats}
      audienceName={audienceName}
      report={report}
      sentCount={events.filter((event) => event.kind === "sent").length}
      backHref={isAdmin ? emailCampaignHome(campaignWithStats) : "/app/email"}
      allowCopy={isAdmin}
    />
  );
}
