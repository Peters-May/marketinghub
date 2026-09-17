import { promises as fs } from "fs";
import path from "path";
import type {
  ContentItem,
  EventItem,
  HubStore,
  MerchInventoryItem,
  MerchOrder,
  StaffRequest,
} from "@/lib/types";
import {
  applyDroneFilmingBudget,
  applyDroneFilmingMeta,
  createDefaultBudgetLines,
  createDefaultBudgetMeta,
  mergeDefaultBudgetPayments,
  needsDefaultBudgetPaymentMigration,
  needsDroneFilmingBudgetMigration,
} from "@/lib/budget/2026";
import { createSeedStore } from "@/lib/store/seed";
import { getDataDir } from "@/lib/store/paths";
import {
  normalizeContentType,
  normalizeChannels,
} from "@/lib/data/normalize";
import { allowDemoAuth } from "@/lib/auth/config";
import { hasServiceRoleKey } from "@/lib/supabase/admin";
import { cache } from "react";

const DATA_DIR = getDataDir();
const STORE_PATH = path.join(DATA_DIR, "store.json");
const HUB_STORE_ID = "default";

function shouldUseDurableSupabaseStore() {
  // Demo/local without service role stays on disk. Production with service role uses DB.
  return hasServiceRoleKey() && !allowDemoAuth();
}

function migrateContent(items: ContentItem[] | undefined): ContentItem[] | undefined {
  if (!items) return items;
  return items.map((item) => {
    const legacy = item as ContentItem & { channel?: string | string[] };
    const channel = normalizeChannels(legacy.channel);
    return {
      ...item,
      channel,
      content_type:
        item.content_type?.trim() ||
        normalizeContentType(channel[0] || "Social"),
      deadline_date: item.deadline_date ?? null,
      category: item.category ?? "",
      priority: item.priority ?? "",
      website: item.website ?? "",
      caption: item.caption ?? "",
      theme_id: item.theme_id ?? null,
    };
  });
}

/** Copy theme_id from theme_mains links onto content rows. */
function syncThemeIdsOntoContent(store: HubStore): HubStore {
  const byContentId = new Map<string, string>();
  for (const main of store.theme_mains ?? []) {
    if (main.content_id && main.theme_id) {
      byContentId.set(main.content_id, main.theme_id);
    }
  }
  if (byContentId.size === 0) return store;
  return {
    ...store,
    content: store.content.map((c) => ({
      ...c,
      theme_id: c.theme_id || byContentId.get(c.id) || null,
    })),
  };
}

function migrateEvents(items: EventItem[] | undefined): EventItem[] | undefined {
  if (!items) return items;
  return items.map((item) => ({
    ...item,
    division: item.division ?? "",
    social_media_post_completed: item.social_media_post_completed ?? false,
    personal_social_media_graphics_completed:
      item.personal_social_media_graphics_completed ?? false,
    reached_out_for_pr_to_organisers:
      item.reached_out_for_pr_to_organisers ?? false,
  }));
}

import { getMerchOrderItems } from "@/lib/merch/order-items";

function migrateMerch(items: MerchOrder[] | undefined): MerchOrder[] | undefined {
  if (!items) return items;
  return items.map((item) => ({
    ...item,
    fit: item.fit === "female" || item.fit === "male" ? item.fit : "",
    logo: item.logo ?? "Commercial",
    requested_for_contact_id: item.requested_for_contact_id ?? null,
    created_by_user_id: item.created_by_user_id ?? null,
    items: item.items?.length ? item.items : getMerchOrderItems(item),
  }));
}

function migrateSponsorships(
  items: HubStore["sponsorships"] | undefined
): HubStore["sponsorships"] | undefined {
  if (!items) return items;
  return items.map((item) => ({
    ...item,
    kind:
      item.kind === "membership" || item.kind === "sponsorship"
        ? item.kind
        : ("sponsorship" as const),
    membership_type:
      item.membership_type === "directory_listing"
        ? "directory_listing"
        : ("membership" as const),
    created_by: item.created_by ?? "",
    created_by_user_id: item.created_by_user_id ?? null,
  }));
}

function migrateContacts(
  items: HubStore["contacts"] | undefined
): HubStore["contacts"] | undefined {
  if (!items) return items;
  return items.map((item) => ({
    ...item,
    kind: item.kind === "company" ? "company" : "person",
    website: item.website ?? "",
    services: item.services ?? "",
    user_id: item.user_id ?? null,
    is_press: Boolean(item.is_press),
    beat: item.beat ?? "",
    outlet: item.outlet ?? "",
    country: item.country ?? "",
    preferred_topics: item.preferred_topics ?? "",
    last_contacted_at: item.last_contacted_at ?? null,
  }));
}

function migrateThemeMains(
  items: HubStore["theme_mains"] | undefined
): HubStore["theme_mains"] | undefined {
  if (!items) return items;
  return items.map((item) => ({
    ...item,
    content_id: item.content_id ?? null,
  }));
}

function migrateStaffRequests(
  items: StaffRequest[] | undefined
): StaffRequest[] | undefined {
  if (!items) return items;
  return items.map((item) => ({
    ...item,
    category: item.category ?? "",
    attachment_url: item.attachment_url ?? "",
  }));
}

function migrateMerchInventory(
  items: MerchInventoryItem[] | undefined
): MerchInventoryItem[] | undefined {
  if (!items) return items;
  return items.map((item) => ({
    ...item,
    image_url: item.image_url ?? "",
  }));
}

function withDefaults(store: Partial<HubStore>): HubStore {
  const seed = createSeedStore();
  // Only fill missing collections with demo rows when the snapshot itself is seed.
  // Real Core snapshots must not get mrc_seed_* orders planted on migration.
  const fillMissingFromSeed = looksLikeSeedStore(store);
  const budgetLines = applyDroneFilmingBudget(
    store.budget_lines ?? createDefaultBudgetLines()
  );
  const budgetMeta = applyDroneFilmingMeta(
    store.budget_meta ?? createDefaultBudgetMeta()
  );
  const base: HubStore = {
    events: migrateEvents(store.events) ?? seed.events,
    event_attendance: store.event_attendance ?? seed.event_attendance,
    content: migrateContent(store.content) ?? seed.content,
    sponsorships:
      migrateSponsorships(store.sponsorships) ?? seed.sponsorships,
    contacts: migrateContacts(store.contacts) ?? seed.contacts,
    resources: store.resources ?? seed.resources,
    reports: store.reports ?? seed.reports,
    paid_campaigns: store.paid_campaigns ?? seed.paid_campaigns,
    advertisements: store.advertisements ?? seed.advertisements,
    platform_credentials:
      store.platform_credentials ?? seed.platform_credentials,
    themes: store.themes ?? seed.themes,
    theme_mains: migrateThemeMains(store.theme_mains) ?? seed.theme_mains,
    theme_offshoots: store.theme_offshoots ?? seed.theme_offshoots,
    merch_orders:
      migrateMerch(store.merch_orders) ??
      (fillMissingFromSeed ? seed.merch_orders : []),
    merch_inventory:
      migrateMerchInventory(store.merch_inventory) ??
      (fillMissingFromSeed ? seed.merch_inventory : []),
    merch_catalogue: store.merch_catalogue ?? seed.merch_catalogue ?? [],
    staff_requests:
      migrateStaffRequests(store.staff_requests) ?? seed.staff_requests,
    awards: store.awards ?? seed.awards,
    tasks: store.tasks ?? seed.tasks,
    hub_users: store.hub_users ?? seed.hub_users,
    access_requests: store.access_requests ?? seed.access_requests,
    page_notes: store.page_notes ?? seed.page_notes ?? {},
    field_extras: store.field_extras ?? seed.field_extras ?? {},
    budget_lines: budgetLines,
    budget_payments: mergeDefaultBudgetPayments(
      store.budget_payments ?? [],
      budgetLines
    ),
    budget_meta: budgetMeta,
    media_lists: store.media_lists ?? seed.media_lists ?? [],
    pr_pitches: store.pr_pitches ?? seed.pr_pitches ?? [],
    pr_coverage: store.pr_coverage ?? seed.pr_coverage ?? [],
    pr_monitor_queries:
      store.pr_monitor_queries ?? seed.pr_monitor_queries ?? [],
    pr_monitor_mentions:
      store.pr_monitor_mentions ?? seed.pr_monitor_mentions ?? [],
  };
  return syncThemeIdsOntoContent(base);
}

/** Demo seed rows use ids like `ctc_seed_1` / `evt_seed_2`. Real Core imports use `sb_*`. */
function looksLikeSeedStore(store: Partial<HubStore> | null): boolean {
  if (!store) return false;
  const sample =
    store.contacts?.[0]?.id ??
    store.events?.[0]?.id ??
    store.content?.[0]?.id ??
    store.tasks?.[0]?.id;
  return typeof sample === "string" && sample.includes("_seed_");
}

/**
 * Prefer real Core Data snapshots over demo seed.
 * When both look real, remote is the durable source of truth — never prefer a
 * stale /tmp local copy (that resurrects deleted merch orders, events, etc.).
 */
function pickPreferredStore(
  remote: Partial<HubStore> | null,
  local: Partial<HubStore> | null
): Partial<HubStore> | null {
  if (!remote && !local) return null;
  if (!remote) return local;
  if (!local) return remote;

  const remoteSeed = looksLikeSeedStore(remote);
  const localSeed = looksLikeSeedStore(local);
  if (remoteSeed && !localSeed) return local;
  if (localSeed && !remoteSeed) return remote;

  return remote;
}

function needsKeyMigration(store: Partial<HubStore>): boolean {
  return (
    !store.themes ||
    !store.theme_mains ||
    !store.theme_offshoots ||
    !store.reports ||
    !store.paid_campaigns ||
    !store.advertisements ||
    !store.platform_credentials ||
    !store.merch_orders ||
    !store.merch_inventory ||
    !store.merch_catalogue ||
    !store.staff_requests ||
    !store.awards ||
    !store.tasks ||
    !store.hub_users ||
    !store.access_requests ||
    !store.page_notes ||
    store.field_extras === undefined ||
    !store.budget_lines ||
    !store.budget_payments ||
    !store.budget_meta ||
    !store.media_lists ||
    !store.pr_pitches ||
    !store.pr_coverage ||
    !store.pr_monitor_queries ||
    !store.pr_monitor_mentions
  );
}

async function readLocalFile(): Promise<Partial<HubStore> | null> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    return JSON.parse(raw) as Partial<HubStore>;
  } catch {
    return null;
  }
}

async function writeLocalFile(store: HubStore): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
  } catch (err) {
    console.error("[store] local write failed", err);
  }
}

type RemoteStoreRow = {
  payload: Partial<HubStore>;
  updatedAt: string;
};

class StoreConflictError extends Error {
  constructor() {
    super("Hub store write conflict");
    this.name = "StoreConflictError";
  }
}

async function readRemoteStore(): Promise<RemoteStoreRow | null> {
  try {
    const { createServiceClient } = await import("@/lib/supabase/admin");
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("hub_store")
      .select("payload, updated_at")
      .eq("id", HUB_STORE_ID)
      .maybeSingle();
    if (error) {
      console.error("[store] remote read failed", error.message);
      return null;
    }
    if (!data?.payload || typeof data.payload !== "object") return null;
    if (!data.updated_at) return null;
    return {
      payload: data.payload as Partial<HubStore>,
      updatedAt: String(data.updated_at),
    };
  } catch (err) {
    console.error("[store] remote read error", err);
    return null;
  }
}

/**
 * Persist to hub_store. When `expectedUpdatedAt` is set, uses compare-and-swap
 * so concurrent serverless writes cannot silently clobber each other.
 */
async function writeRemoteStore(
  store: HubStore,
  expectedUpdatedAt: string | null
): Promise<"ok" | "conflict" | "error"> {
  try {
    const { createServiceClient } = await import("@/lib/supabase/admin");
    const supabase = createServiceClient();

    if (expectedUpdatedAt) {
      const { data, error } = await supabase.rpc("hub_store_cas_update", {
        p_id: HUB_STORE_ID,
        p_payload: store,
        p_expected_updated_at: expectedUpdatedAt,
      });
      if (error) {
        console.error("[store] remote CAS write failed", error.message);
        return "error";
      }
      if (data == null) return "conflict";
      return "ok";
    }

    const { error } = await supabase.from("hub_store").upsert(
      {
        id: HUB_STORE_ID,
        payload: store,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
    if (error) {
      console.error("[store] remote write failed", error.message);
      return "error";
    }
    return "ok";
  } catch (err) {
    console.error("[store] remote write error", err);
    return "error";
  }
}

type StoreRead = {
  store: HubStore;
  /** Remote row version for CAS; null when using local-only disk store. */
  remoteUpdatedAt: string | null;
};

async function ensureStore(): Promise<StoreRead> {
  if (shouldUseDurableSupabaseStore()) {
    const remote = await readRemoteStore();
    const local = await readLocalFile();
    const preferred = pickPreferredStore(remote?.payload ?? null, local);

    if (!preferred) {
      // First-run only: never seed-overwrite an existing remote row.
      const seed = createSeedStore();
      const written = await writeRemoteStore(seed, null);
      if (written === "error") {
        throw new Error("Failed to initialize hub store in Supabase");
      }
      await writeLocalFile(seed);
      // Re-read so CAS version matches the row we just wrote.
      const again = await readRemoteStore();
      return {
        store: seed,
        remoteUpdatedAt: again?.updatedAt ?? null,
      };
    }

    const merged = withDefaults(preferred);
    const upgradingFromSeed =
      looksLikeSeedStore(remote?.payload ?? null) &&
      !looksLikeSeedStore(preferred);

    // Remote read failed but we have a local cache — serve it read-only.
    // Never upsert local over an unknown remote (that resurrects stale /tmp).
    if (!remote) {
      console.error(
        "[store] remote read unavailable; serving local cache without durable write"
      );
      return { store: merged, remoteUpdatedAt: null };
    }

    // Do NOT write remote on every read — that races with restores and can
    // push stale /tmp seed back over a good hub_store snapshot.
    // Migration writes use CAS; on conflict another writer already persisted.
    if (
      upgradingFromSeed ||
      needsKeyMigration(preferred) ||
      needsDefaultBudgetPaymentMigration(preferred.budget_payments) ||
      needsDroneFilmingBudgetMigration(preferred.budget_lines, preferred.budget_meta)
    ) {
      const result = await writeRemoteStore(merged, remote.updatedAt);
      if (result === "ok") {
        await writeLocalFile(merged);
        const again = await readRemoteStore();
        return {
          store: merged,
          remoteUpdatedAt: again?.updatedAt ?? remote.updatedAt,
        };
      }
      if (result === "conflict") {
        // Latest remote won — return it rather than clobbering.
        const latest = await readRemoteStore();
        if (latest) {
          const latestMerged = withDefaults(latest.payload);
          await writeLocalFile(latestMerged);
          return {
            store: latestMerged,
            remoteUpdatedAt: latest.updatedAt,
          };
        }
      }
      if (result === "error") {
        console.error("[store] migration write failed; serving merged cache");
      }
    }
    await writeLocalFile(merged);
    return {
      store: merged,
      remoteUpdatedAt: remote.updatedAt,
    };
  }

  const parsed = await readLocalFile();
  if (!parsed) {
    const seed = createSeedStore();
    await writeLocalFile(seed);
    return { store: seed, remoteUpdatedAt: null };
  }
  const merged = withDefaults(parsed);
  if (
    needsKeyMigration(parsed) ||
    needsDefaultBudgetPaymentMigration(parsed.budget_payments) ||
    needsDroneFilmingBudgetMigration(parsed.budget_lines, parsed.budget_meta)
  ) {
    await writeLocalFile(merged);
  }
  return { store: merged, remoteUpdatedAt: null };
}

export const readStore = cache(async (): Promise<HubStore> => {
  return (await ensureStore()).store;
});

export async function writeStore(
  store: HubStore,
  expectedRemoteUpdatedAt: string | null = null
): Promise<void> {
  if (shouldUseDurableSupabaseStore()) {
    const version = expectedRemoteUpdatedAt;
    if (!version) {
      const remote = await readRemoteStore();
      if (remote) {
        // Row exists — never blind-upsert; force CAS retry with a version.
        throw new StoreConflictError();
      }
      // Truly missing row — allow insert.
    }
    const result = await writeRemoteStore(store, version);
    if (result === "conflict") throw new StoreConflictError();
    if (result === "error") {
      console.error("[store] durable write failed; local cache updated only");
      throw new Error("Failed to persist hub store to Supabase");
    }
    await writeLocalFile(store);
    return;
  }
  await writeLocalFile(store);
}

const MAX_STORE_WRITE_ATTEMPTS = 8;

/** Serialize store mutations on this process so concurrent writes can't clobber each other. */
let updateStoreChain: Promise<unknown> = Promise.resolve();

export async function updateStore(
  mutator: (store: HubStore) => HubStore | void
): Promise<HubStore> {
  const run = async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_STORE_WRITE_ATTEMPTS; attempt++) {
      const { store, remoteUpdatedAt } = await ensureStore();
      const next = mutator(store) ?? store;
      try {
        await writeStore(next, remoteUpdatedAt);
        return next;
      } catch (err) {
        lastError = err;
        if (err instanceof StoreConflictError) {
          // Another instance wrote first — re-read and re-apply mutator.
          continue;
        }
        throw err;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("Failed to persist hub store after conflicts");
  };
  // Always continue the queue after failures so one bad write doesn't deadlock updates.
  const result = updateStoreChain.then(run, run);
  updateStoreChain = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}
