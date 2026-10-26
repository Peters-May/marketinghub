import type { PlanableSyncResult } from "@/lib/planable/sync";

const GROUP_BATCH = 2;
const CLEANUP_BATCH = 15;

type PlanableSets = {
  archivedPostIds: string[];
  activePostIds: string[];
  activeGroupIds: string[];
};

export async function planableSyncWorkflow(): Promise<PlanableSyncResult> {
  "use workflow";
  console.log("[workflow] planable sync start");
  const snapshot = await loadPlanableSnapshot();
  if (!snapshot.configured || (snapshot.error && snapshot.groups.length === 0)) {
    const empty = {
      configured: snapshot.configured,
      created: 0,
      updated: 0,
      skipped: 0,
      lockedPublished: 0,
      removed: 0,
      openUrl: snapshot.openUrl,
      ...(snapshot.error ? { error: snapshot.error } : {}),
    };
    console.log("[workflow] planable sync stopped", empty.error ?? "not configured");
    return empty;
  }

  const totals = {
    created: 0,
    updated: 0,
    skipped: 0,
    lockedPublished: 0,
    removed: 0,
  };
  for (let index = 0; index < snapshot.groups.length; index += GROUP_BATCH) {
    const page = await applyGroupBatch(snapshot.groups.slice(index, index + GROUP_BATCH));
    totals.created += page.created;
    totals.updated += page.updated;
    totals.skipped += page.skipped;
    totals.lockedPublished += page.lockedPublished;
    totals.removed += page.removed;
    console.log("[workflow] planable groups", index, page.created, page.updated);
  }

  const linkedIds = await listLinkedContentIds();
  for (let index = 0; index < linkedIds.length; index += CLEANUP_BATCH) {
    const removed = await removeStaleBatch(
      linkedIds.slice(index, index + CLEANUP_BATCH),
      snapshot.sets
    );
    totals.removed += removed;
  }
  totals.removed += await collapseDuplicates();

  const result: PlanableSyncResult = {
    configured: true,
    ...totals,
    openUrl: snapshot.openUrl,
    ...(snapshot.error ? { error: snapshot.error } : {}),
  };
  console.log("[workflow] planable sync finished", result.created, result.updated, result.removed);
  return result;
}

async function loadPlanableSnapshot() {
  "use step";
  console.log("[workflow] load planable posts");
  const { listAllPlanablePosts } = await import("@/lib/planable/client");
  const { groupPlanablePosts } = await import("@/lib/planable/sync");
  const listed = await listAllPlanablePosts({ cache: "no-store" });
  const groups = listed.configured ? groupPlanablePosts(listed.posts) : [];
  return {
    configured: listed.configured,
    openUrl: listed.openUrl,
    error: listed.error,
    groups,
    sets: {
      archivedPostIds: listed.posts.filter((post) => post.archived).map((post) => post.id),
      activePostIds: listed.posts.filter((post) => !post.archived).map((post) => post.id),
      activeGroupIds: groups.map((group) => group.groupId).filter((id) => Boolean(id)),
    } satisfies PlanableSets,
  };
}

async function applyGroupBatch(
  groups: Awaited<ReturnType<typeof loadPlanableSnapshot>>["groups"]
) {
  "use step";
  console.log("[workflow] apply planable groups", groups.length);
  const { applyPlanableGroups } = await import("@/lib/planable/sync");
  return applyPlanableGroups(groups);
}

async function listLinkedContentIds() {
  "use step";
  console.log("[workflow] list planable-linked content");
  const { listContent, withContentPlanableDefaults } = await import("@/lib/data/repos");
  const { isSocialContentItem } = await import("@/lib/data/normalize");
  return (await listContent())
    .map(withContentPlanableDefaults)
    .filter(
      (item) =>
        isSocialContentItem(item) &&
        Boolean(item.planable_post_id || item.planable_group_id)
    )
    .map((item) => item.id);
}

async function removeStaleBatch(ids: string[], sets: PlanableSets) {
  "use step";
  console.log("[workflow] remove stale planable rows", ids.length);
  const { deleteStalePlanableItems } = await import("@/lib/planable/sync");
  return deleteStalePlanableItems({ ids, ...sets });
}

async function collapseDuplicates() {
  "use step";
  console.log("[workflow] collapse planable duplicates");
  const { collapseDuplicatePlanableContent } = await import("@/lib/planable/sync");
  return collapseDuplicatePlanableContent();
}
