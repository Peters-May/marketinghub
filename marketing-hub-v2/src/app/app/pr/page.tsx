import { redirect } from "next/navigation";
import {
  listContacts,
  listContent,
  listMediaLists,
  listPrCoverage,
  listPrMonitorMentions,
  listPrMonitorQueries,
  listPrPitches,
} from "@/lib/data/repos";
import { PrClient } from "@/components/pr/PrClient";
import { getSessionUser } from "@/lib/auth/session";
import { allowDemoAuth, DEMO_STAFF } from "@/lib/auth/config";

export const dynamic = "force-dynamic";

export default async function PrPage() {
  const user =
    (await getSessionUser()) ?? (allowDemoAuth() ? DEMO_STAFF : null);
  if (!user || user.role !== "admin") {
    redirect("/app");
  }

  const [
    contacts,
    mediaLists,
    pitches,
    coverage,
    content,
    queries,
    mentions,
  ] = await Promise.all([
    listContacts(),
    listMediaLists(),
    listPrPitches(),
    listPrCoverage(),
    listContent(),
    listPrMonitorQueries(),
    listPrMonitorMentions(),
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
      newsApiConfigured={Boolean(process.env.NEWS_API_KEY?.trim())}
    />
  );
}
