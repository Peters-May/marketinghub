import type { PortalAudienceSyncResult, PortalListStep } from "@/lib/sync/portal-marketing";

export async function portalAudienceWorkflow(): Promise<PortalAudienceSyncResult> {
  "use workflow";
  console.log("[workflow] portal audience start");
  const loaded = await loadPortalLists();
  if (loaded.skipped) {
    console.log("[workflow] portal audience skipped", loaded.reason);
    return {
      ok: true,
      skipped: true,
      reason: loaded.reason,
      upserted: 0,
      removed: 0,
    };
  }

  for (const list of loaded.lists) {
    await syncPortalList(list);
  }
  await retirePortalLists(loaded.lists.map((list) => list.id));
  const audience = await syncOptInAudience();
  if (audience.ok && !audience.skipped) {
    await backfillRecentSends();
  }
  const result = { ...audience, lists: loaded.lists.length };
  console.log("[workflow] portal audience finished", result.upserted, result.lists);
  return result;
}

async function loadPortalLists() {
  "use step";
  console.log("[workflow] load portal lists");
  const { loadPortalSharedLists } = await import("@/lib/sync/portal-marketing");
  return loadPortalSharedLists();
}

async function syncPortalList(list: PortalListStep) {
  "use step";
  console.log("[workflow] sync portal list", list.id);
  const { syncPortalSharedList } = await import("@/lib/sync/portal-marketing");
  return syncPortalSharedList(list);
}

async function retirePortalLists(activeIds: string[]) {
  "use step";
  console.log("[workflow] retire portal lists", activeIds.length);
  const { retirePortalSharedLists } = await import("@/lib/sync/portal-marketing");
  await retirePortalSharedLists(activeIds);
}

async function syncOptInAudience() {
  "use step";
  console.log("[workflow] sync portal opt-in audience");
  const { syncPortalMarketingAudience } = await import("@/lib/sync/portal-marketing");
  return syncPortalMarketingAudience({ includeLists: false });
}

async function backfillRecentSends() {
  "use step";
  console.log("[workflow] backfill portal sends");
  const { backfillPortalCampaignSends } = await import("@/lib/sync/portal-marketing");
  await backfillPortalCampaignSends();
}
