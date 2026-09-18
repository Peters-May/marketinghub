import { redirect, notFound } from "next/navigation";
import {
  getNewsroomSettings,
  listContacts,
  listContent,
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
  "reporting",
  "statistics",
]);

export default async function PrSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ content_id?: string }>;
}) {
  const user =
    (await getSessionUser()) ?? (allowDemoAuth() ? DEMO_STAFF : null);
  if (!user || user.role !== "admin") {
    redirect("/app");
  }

  const { section: raw } = await params;
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
    queries,
    mentions,
    newsroom,
  ] = await Promise.all([
    listContacts(),
    listMediaLists(),
    listPrPitches(),
    listPrCoverage(),
    listContent(),
    listPrMonitorQueries(),
    listPrMonitorMentions(),
    getNewsroomSettings(),
  ]);

  return (
    <PrClient
      initialContacts={contacts}
      initialLists={mediaLists}
      initialPitches={pitches}
      initialCoverage={coverage}
      initialContent={content}
      initialQueries={queries}
      initialMentions={mentions}
      initialNewsroom={newsroom}
      newsApiConfigured={Boolean(process.env.NEWS_API_KEY?.trim())}
      initialSection={section}
      prefillContentId={prefillContentId}
    />
  );
}
