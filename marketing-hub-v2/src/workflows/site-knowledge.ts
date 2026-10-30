import type { SiteKnowledgeSyncResult } from "@/lib/chat/sync-site-knowledge";

const BATCH = 8;

export async function siteKnowledgeSyncWorkflow(): Promise<SiteKnowledgeSyncResult> {
  "use workflow";
  console.log("[workflow] site knowledge sync start");
  const ready = await storageReadyStep();
  if (!ready) {
    return {
      discovered: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      deactivated: 0,
      error: "Chat storage is not configured",
    };
  }

  const urls = await discoverStep();
  const totals = { updated: 0, skipped: 0, failed: 0 };
  for (let index = 0; index < urls.length; index += BATCH) {
    const page = await syncBatchStep(urls.slice(index, index + BATCH));
    totals.updated += page.updated;
    totals.skipped += page.skipped;
    totals.failed += page.failed;
    console.log(
      "[workflow] site knowledge batch",
      index,
      page.updated,
      page.failed
    );
  }
  const deactivated = await deactivateStep(urls);
  const result: SiteKnowledgeSyncResult = {
    discovered: urls.length,
    ...totals,
    deactivated,
  };
  console.log("[workflow] site knowledge sync finished", result.discovered, result.updated);
  return result;
}

async function storageReadyStep(): Promise<boolean> {
  "use step";
  const { hasServiceRoleKey } = await import("@/lib/supabase/admin");
  return hasServiceRoleKey();
}

async function discoverStep(): Promise<string[]> {
  "use step";
  const { discoverSitePageUrls } = await import("@/lib/chat/sync-site-knowledge");
  return discoverSitePageUrls();
}

async function syncBatchStep(urls: string[]) {
  "use step";
  const { syncSitePageBatch } = await import("@/lib/chat/sync-site-knowledge");
  return syncSitePageBatch(urls);
}

async function deactivateStep(urls: string[]): Promise<number> {
  "use step";
  const { deactivateMissingSitePages } = await import(
    "@/lib/chat/sync-site-knowledge"
  );
  return deactivateMissingSitePages(urls);
}
