import { redirect } from "next/navigation";
import {
  getNewsroomSettings,
  listContacts,
  listContent,
  listMediaLists,
  listPrCoverage,
  listPrMonitorMentions,
  listPrPitches,
} from "@/lib/data/repos";
import { isPressContact } from "@/lib/pr/pitch-eml";
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

  const [contacts, lists, pitches, coverage, content, mentions] =
    await Promise.all([
      listContacts(),
      listMediaLists(),
      listPrPitches(),
      listPrCoverage(),
      listContent(),
      listPrMonitorMentions(),
      getNewsroomSettings(),
    ]);

  const releases = content.filter((c) => {
    if (c.status !== "published") return false;
    const type = (c.content_type || "").toLowerCase();
    const cat = (c.category || "").toLowerCase();
    const channels = (c.channel || []).map((x) => x.toLowerCase());
    return (
      type === "pr" ||
      type === "press" ||
      cat === "press release" ||
      channels.includes("pr")
    );
  });

  return (
    <PrHome
      stats={{
        pressContacts: contacts.filter(isPressContact).length,
        lists: lists.length,
        pitches: pitches.length,
        coverage: coverage.length,
        releases: releases.length,
        mentions: mentions.filter((m) => m.status === "new").length,
      }}
    />
  );
}
