import { redirect, notFound } from "next/navigation";
import {
  getNewsroomSettings,
  listContacts,
  listEmailSuppressions,
  listContent,
  listEmailCampaigns,
  listMediaLists,
  listPrCoverage,
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
  if (raw === "reporting" || raw === "statistics") {
    redirect("/app/pr/releases");
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
    content,
    campaigns,
    queries,
    mentions,
    newsroom,
    suppressions,
  ] = await Promise.all([
    listContacts(),
    listMediaLists(),
    listPrPitches(),
    listPrCoverage(),
    listContent(),
    listEmailCampaigns(),
    listPrMonitorQueries(),
    listPrMonitorMentions(),
    getNewsroomSettings(),
    listEmailSuppressions(),
  ]);

  return (
    <PrClient
      initialContacts={contacts}
      initialLists={mediaLists}
      initialPitches={pitches}
      initialCoverage={coverage}
      initialContent={content}
      initialCampaigns={campaigns}
      initialQueries={queries}
      initialMentions={mentions}
      initialNewsroom={newsroom}
      newsApiConfigured={Boolean(process.env.NEWS_API_KEY?.trim())}
      suppressedEmails={suppressions.map((row) => row.email)}
      initialSection={section}
      prefillContentId={prefillContentId}
      openNewRelease={section === "releases" && qs.new === "1"}
    />
  );
}
