import { notFound, redirect } from "next/navigation";
import { EmailCampaignSummary } from "@/components/email/EmailCampaignSummary";
import { allowDemoAuth, DEMO_STAFF } from "@/lib/auth/config";
import { isStaffSession } from "@/lib/auth/roles";
import { getSessionUser } from "@/lib/auth/session";
import { emailCampaignHome, isMemberVisibleCampaign } from "@/lib/email/category";
import { buildCampaignReport } from "@/lib/email/campaign-report";
import {
  getEmailCampaign,
  listContactNamesByEmails,
  listEmailAudiences,
  listEmailEvents,
  listEmailSuppressions,
  syncEmailCampaignStats,
} from "@/lib/data/repos";
import {
  campaignStatsFromEvents,
  emailStatsEqual,
} from "@/lib/email/stats-projector";
import type { EmailEventKind } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Finished sends already store recipient totals; skip per-recipient "sent" rows. */
const SENT_SUMMARY_KINDS: EmailEventKind[] = [
  "delivered",
  "opened",
  "clicked",
  "bounced",
  "complained",
  "unsubscribed",
];

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

  const campaign = await getEmailCampaign(params.id);
  if (!campaign) notFound();
  if (!isAdmin && !isMemberVisibleCampaign(campaign)) {
    redirect("/app/email");
  }
  if (isAdmin && campaign.status !== "sent" && campaign.status !== "sending") {
    redirect(`/app/email/design/campaign/${encodeURIComponent(campaign.id)}`);
  }

  const skipSentRows =
    campaign.status === "sent" && (campaign.stats.recipients || 0) > 0;
  const [audiences, events, suppressions] = await Promise.all([
    listEmailAudiences(),
    listEmailEvents(
      params.id,
      skipSentRows ? { kinds: SENT_SUMMARY_KINDS } : undefined
    ),
    listEmailSuppressions(),
  ]);

  const liveStats = campaignStatsFromEvents(events, campaign.stats);
  let campaignWithStats = campaign;
  if (!emailStatsEqual(liveStats, campaign.stats)) {
    campaignWithStats = { ...campaign, stats: liveStats };
    // Heal the stored counters after paint; do not block opening the report.
    void syncEmailCampaignStats(campaign.id, liveStats).catch((err) => {
      console.error(
        "[email-stats] heal failed",
        err instanceof Error ? err.message : err
      );
    });
  }

  const audienceName =
    audiences.find((audience) => audience.id === campaign.audience_id)?.name ??
    "";
  const campaignSuppressions = suppressions.filter(
    (row) => row.campaign_id === campaign.id
  );

  // First pass without names so we only look up the people the UI lists.
  const draftReport = buildCampaignReport({
    campaign: campaignWithStats,
    events,
    contacts: [],
    suppressions: campaignSuppressions,
  });
  const nameEmails = [
    ...draftReport.contacts.map((row) => row.email),
    ...draftReport.unsubscribedPeople.map((row) => row.email),
    ...draftReport.bouncedPeople.map((row) => row.email),
  ];
  const contacts = await listContactNamesByEmails(nameEmails);
  const report =
    contacts.length > 0
      ? buildCampaignReport({
          campaign: campaignWithStats,
          events,
          contacts,
          suppressions: campaignSuppressions,
        })
      : draftReport;

  const sentCount = skipSentRows
    ? campaignWithStats.stats.recipients
    : events.filter((event) => event.kind === "sent").length;

  return (
    <EmailCampaignSummary
      campaign={campaignWithStats}
      audienceName={audienceName}
      report={report}
      sentCount={sentCount}
      backHref={isAdmin ? emailCampaignHome(campaignWithStats) : "/app/email"}
      allowCopy={isAdmin}
    />
  );
}
