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
import { normalizeNewsroomSettings } from "@/lib/pr/newsroom-settings";
import { normalizeEmailSettings } from "@/lib/email/email-settings";
import { normalizeAiKeySettings } from "@/lib/ai/ai-key-status";
import {
  applyReleaseLibrary,
  needsReleaseLibrary,
} from "@/lib/pr/release-library";
import { applyCalendarThemeStatuses } from "@/lib/themes/calendar";

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
    pm_attending: item.pm_attending ?? false,
    accommodation_arranged: item.accommodation_arranged ?? false,
    costs_collected: item.costs_collected ?? false,
    stand_or_passes_booked: item.stand_or_passes_booked ?? false,
    press_kit_ready: item.press_kit_ready ?? false,
    social_media_post_completed: item.social_media_post_completed ?? false,
    personal_social_media_graphics_completed:
      item.personal_social_media_graphics_completed ?? false,
    reached_out_for_pr_to_organisers:
      item.reached_out_for_pr_to_organisers ?? false,
    hotel_name: item.hotel_name ?? "",
    hotel_confirmation: item.hotel_confirmation ?? "",
    hotel_check_in: item.hotel_check_in ?? "",
    hotel_check_out: item.hotel_check_out ?? "",
    hotel_guests: item.hotel_guests ?? "",
    hotel_cost_estimate: item.hotel_cost_estimate ?? "",
    hotel_booking_url: item.hotel_booking_url ?? "",
    hotel_notes: item.hotel_notes ?? "",
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
    is_spokesperson: Boolean(item.is_spokesperson),
    beat: item.beat ?? "",
    outlet: item.outlet ?? "",
    country: item.country ?? "",
    preferred_topics: item.preferred_topics ?? "",
    last_contacted_at: item.last_contacted_at ?? null,
    marketing_consent:
      item.marketing_consent === true
        ? true
        : item.marketing_consent === false
          ? false
          : null,
    portal_contact_id: item.portal_contact_id ?? null,
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
    event_content: store.event_content ?? [],
    event_offices: store.event_offices ?? [],
    event_bookings: store.event_bookings ?? [],
    event_attendance_requests: store.event_attendance_requests ?? [],
    event_attendance_request_lines: store.event_attendance_request_lines ?? [],
    profile_offices: store.profile_offices ?? [],
    notifications: store.notifications ?? [],
    notification_rules: store.notification_rules?.length
      ? store.notification_rules
      : seed.notification_rules,
    automation_runs: store.automation_runs ?? [],
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
    themes: applyCalendarThemeStatuses(store.themes ?? seed.themes),
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
    email_templates: store.email_templates ?? seed.email_templates ?? [],
    email_audiences: store.email_audiences ?? seed.email_audiences ?? [],
    email_campaigns: store.email_campaigns ?? seed.email_campaigns ?? [],
    email_suppressions:
      store.email_suppressions ?? seed.email_suppressions ?? [],
    email_events: store.email_events ?? seed.email_events ?? [],
    email_gallery: store.email_gallery ?? seed.email_gallery ?? [],
    email_settings: normalizeEmailSettings(
      store.email_settings ?? seed.email_settings
    ),
    ai_settings: normalizeAiKeySettings(store.ai_settings ?? seed.ai_settings),
    newsroom_settings: normalizeNewsroomSettings(
      store.newsroom_settings ?? seed.newsroom_settings
    ),
  };
  return applyReleaseLibrary(syncThemeIdsOntoContent(base));
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
    !store.pr_monitor_mentions ||
    !store.email_templates ||
    !store.email_audiences ||
    !store.email_campaigns ||
    !store.email_suppressions ||
    !store.email_events ||
    !store.email_gallery ||
    !store.email_settings ||
    !store.ai_settings ||
    !store.newsroom_settings ||
    needsReleaseLibrary(store)
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
    // Compact JSON. Pretty-printing the full hub document on the save path
    // is disk work that does not change what Supabase stores.
    await fs.writeFile(STORE_PATH, JSON.stringify(store), "utf8");
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
  let data: { payload?: unknown; updated_at?: string } | null = null;
  let error: { message?: string } | null = null;
  try {
    const { createServiceClient } = await import("@/lib/supabase/admin");
    const supabase = createServiceClient();
    const result = await supabase
      .from("hub_store")
      .select("payload, updated_at")
      .eq("id", HUB_STORE_ID)
      .maybeSingle();
    data = result.data;
    error = result.error;
  } catch (err) {
    console.error("[store] remote read error", err);
    throw new Error("Hub store could not be read. Nothing was replaced.");
  }
  if (error) {
    console.error("[store] remote read failed", error.message);
    throw new Error("Hub store could not be read. Nothing was replaced.");
  }
  if (!data?.payload || typeof data.payload !== "object") return null;
  if (!data.updated_at) return null;
  return {
    payload: data.payload as Partial<HubStore>,
    updatedAt: String(data.updated_at),
  };
}

/** Insert only. A timeout must never become an upsert over the live hub. */
async function insertRemoteStoreIfMissing(
  store: HubStore
): Promise<"ok" | "exists" | "error"> {
  try {
    const { createServiceClient } = await import("@/lib/supabase/admin");
    const supabase = createServiceClient();
    const { error } = await supabase.from("hub_store").insert({
      id: HUB_STORE_ID,
      payload: store,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      const code = "code" in error ? String(error.code) : "";
      if (code === "23505" || /duplicate key/i.test(error.message)) {
        return "exists";
      }
      console.error("[store] remote insert failed", error.message);
      return "error";
    }
    return "ok";
  } catch (err) {
    console.error("[store] remote insert error", err);
    return "error";
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

    if (!expectedUpdatedAt) {
      console.error("[store] refused a blind overwrite of hub_store");
      return "error";
    }

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
    // An existing remote row is the source of truth, even when it looks like
    // the demo seed. A local or /tmp file must not be written over it.
    const local = remote ? null : await readLocalFile();
    const preferred = pickPreferredStore(remote?.payload ?? null, local);

    if (!preferred) {
      // First-run only. Insert, never upsert: a failed read must not land here,
      // and a row that already exists must not be replaced with the demo seed.
      const seed = createSeedStore();
      const inserted = await insertRemoteStoreIfMissing(seed);
      if (inserted === "exists") {
        const again = await readRemoteStore();
        if (!again) {
          throw new Error("Hub store could not be read. Nothing was replaced.");
        }
        return {
          store: withDefaults(again.payload),
          remoteUpdatedAt: again.updatedAt,
        };
      }
      if (inserted === "error") {
        throw new Error("Failed to initialize hub store in Supabase");
      }
      await writeLocalFile(seed);
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
    needsDroneFilmingBudgetMigration(parsed.budget_lines, parsed.budget_meta) ||
    needsReleaseLibrary(parsed)
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
      const inserted = await insertRemoteStoreIfMissing(store);
      if (inserted === "exists") throw new StoreConflictError();
      if (inserted === "error") {
        throw new Error("Failed to persist hub store to Supabase");
      }
      await writeLocalFile(store);
      return;
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
        const message = err instanceof Error ? err.message : "";
        if (
          err instanceof StoreConflictError ||
          /timeout/i.test(message)
        ) {
          await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
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
