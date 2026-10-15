import { notFound, redirect } from "next/navigation";
import { EmailCampaignSummary } from "@/components/email/EmailCampaignSummary";
import { allowDemoAuth, DEMO_STAFF } from "@/lib/auth/config";
import { getSessionUser } from "@/lib/auth/session";
import { buildCampaignReport } from "@/lib/email/campaign-report";
import {
  getEmailCampaign,
  listContacts,
  listEmailAudiences,
  listEmailEvents,
  listEmailSuppressions,
} from "@/lib/data/repos";

export const dynamic = "force-dynamic";

export default async function EmailCampaignSummaryPage({
  params,
}: {
  params: { id: string };
}) {
  const user =
    (await getSessionUser()) ?? (allowDemoAuth() ? DEMO_STAFF : null);
  if (!user || user.role !== "admin") {
    redirect("/app");
  }

  const [campaign, audiences, events, contacts, suppressions] = await Promise.all([
    getEmailCampaign(params.id),
    listEmailAudiences(),
    listEmailEvents(params.id),
    listContacts(),
    listEmailSuppressions(),
  ]);
  if (!campaign) notFound();
  if (campaign.status !== "sent" && campaign.status !== "sending") {
    redirect(`/app/email/design/campaign/${encodeURIComponent(campaign.id)}`);
  }

  const audienceName =
    audiences.find((audience) => audience.id === campaign.audience_id)?.name ??
    "";
  const report = buildCampaignReport({
    campaign,
    events,
    contacts,
    suppressions,
  });

  return (
    <EmailCampaignSummary
      campaign={campaign}
      audienceName={audienceName}
      report={report}
    />
  );
}
