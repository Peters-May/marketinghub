import { redirect } from "next/navigation";
import {
  listContacts,
  listContent,
  listEmailCampaigns,
  listMediaLists,
  listPrCoverage,
  listPrMonitorMentions,
  listPrPitches,
} from "@/lib/data/repos";
import { isPressContact } from "@/lib/pr/pitch-eml";
import { buildPrPipeline, isPressRelease } from "@/lib/pr/pipeline";
import { isContactSegment } from "@/lib/contacts/segments";
import { PrHome } from "@/components/pr/PrHome";
import { getSessionUser } from "@/lib/auth/session";
import { allowDemoAuth, DEMO_STAFF } from "@/lib/auth/config";

export const dynamic = "force-dynamic";

export default async function PrHomePage() {
  const user =
    (await getSessionUser()) ?? (allowDemoAuth() ? DEMO_STAFF : null);
  if (!user || user.role !== "admin") {
    redirect("/app");
  }

  const [contacts, lists, pitches, coverage, content, mentions, campaigns] =
    await Promise.all([
      listContacts(),
      listMediaLists(),
      listPrPitches(),
      listPrCoverage(),
      listContent(),
      listPrMonitorMentions(),
      listEmailCampaigns(),
    ]);

  const releases = content.filter(
    (item) => item.status === "published" && isPressRelease(item)
  );

  return (
    <PrHome
      pipeline={buildPrPipeline({ content, pitches, coverage, campaigns })}
      stats={{
        pressContacts: contacts.filter(isPressContact).length,
        lists: lists.filter(isContactSegment).length,
        pitches: pitches.length,
        coverage: coverage.length,
        releases: releases.length,
        mentions: mentions.filter((m) => m.status === "new").length,
      }}
    />
  );
}
