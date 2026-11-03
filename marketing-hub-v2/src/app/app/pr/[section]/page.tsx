import { redirect, notFound } from "next/navigation";
import {
  getNewsroomSettings,
  getPrMonitorSettings,
  listContacts,
  listEmailSuppressions,
  listContent,
  listEmailCampaigns,
  listMediaLists,
  listPrCoverage,
  listPrCoverageReports,
  listPrMonitorMentions,
  listPrMonitorQueries,
  listPrPitches,
} from "@/lib/data/repos";
import { PrClient, type PrSection } from "@/components/pr/PrClient";
import { getSessionUser } from "@/lib/auth/session";
import { allowDemoAuth, DEMO_STAFF } from "@/lib/auth/config";

export const dynamic = "force-dynamic";

const SECTIONS = new Set<PrSection>([
  "contacts",
  "database",
  "lists",
  "releases",
  "emails",
  "pitches",
  "coverage",
  "reports",
  "reporting",
  "monitor",
  "monitoring",
  "newsroom",
]);

export default async function PrSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ content_id?: string; new?: string }>;
}) {
  const user =
    (await getSessionUser()) ?? (allowDemoAuth() ? DEMO_STAFF : null);
  if (!user || user.role !== "admin") {
    redirect("/app");
  }

  const { section: raw } = await params;
  if (raw === "statistics") {
    redirect("/app/pr/releases");
  }
  if (raw === "reporting") {
    redirect("/app/pr/reports");
  }
  const section = raw as PrSection;
  if (!SECTIONS.has(section)) notFound();

  const qs = await searchParams;
  const prefillContentId = qs.content_id?.trim() || null;

  const [
    contacts,
    mediaLists,
    pitches,
    coverage,
    coverageReports,
    content,
    campaigns,
    queries,
    mentions,
    monitorSettings,
    newsroom,
    suppressions,
  ] = await Promise.all([
    listContacts(),
    listMediaLists(),
    listPrPitches(),
    listPrCoverage(),
    listPrCoverageReports(),
    listContent(),
    listEmailCampaigns(),
    listPrMonitorQueries(),
    listPrMonitorMentions(),
    getPrMonitorSettings(),
    getNewsroomSettings(),
    listEmailSuppressions(),
  ]);

  return (
    <PrClient
      initialContacts={contacts}
      initialLists={mediaLists}
      initialPitches={pitches}
      initialCoverage={coverage}
      initialCoverageReports={coverageReports}
      initialContent={content}
      initialCampaigns={campaigns}
      initialQueries={queries}
      initialMentions={mentions}
      initialMonitorSettings={monitorSettings}
      initialNewsroom={newsroom}
      newsApiConfigured={Boolean(process.env.NEWS_API_KEY?.trim())}
      suppressedEmails={suppressions.map((row) => row.email)}
      initialSection={section}
      prefillContentId={prefillContentId}
      openNewRelease={section === "releases" && qs.new === "1"}
    />
  );
}
