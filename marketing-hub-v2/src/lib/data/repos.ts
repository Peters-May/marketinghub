import { uid } from "@/lib/utils";
import { readStore, updateStore } from "@/lib/store/local";
import { clothingProductById } from "@/lib/merch/north-sails";
import {
  normalizeMerchOrderItems,
  syncMerchOrderPrimaryFields,
} from "@/lib/merch/order-items";
import { effectiveProductLabel } from "@/lib/merch/product-images";
import {
  decryptCredentialSecret,
  encryptCredentialSecret,
} from "@/lib/security/credentials-crypto";
import type {
  AccessRequest,
  Advertisement,
  AwardEntry,
  BudgetLine,
  BudgetPayment,
  Contact,
  ContentItem,
  ContentStatus,
  EventAttendance,
  EventAttendanceStatus,
  EventItem,
  HubAccessRole,
  HubTask,
  HubUser,
  MerchCatalogueImage,
  MerchInventoryItem,
  MerchOrder,
  PaidCampaign,
  PlatformCredential,
  QuarterlyTheme,
  ReportLink,
  ResourceLink,
  Sponsorship,
  SponsorshipStatus,
  StaffRequest,
  ThemeMainContent,
  ThemeOffshoot,
  MediaList,
  PrPitch,
  PrPitchStatus,
  PrCoverage,
  PrCoverageSentiment,
  PrMonitorQuery,
  PrMonitorMention,
  PrMonitorMentionStatus,
  NewsroomSettings,
} from "@/lib/types";
import { normalizeNewsroomSettings } from "@/lib/pr/newsroom-settings";

function nowIso() {
  return new Date().toISOString();
}

/** Backfill Planable sync fields for older hub_store rows. */
export function withContentPlanableDefaults(
  item: ContentItem
): ContentItem {
  return {
    ...item,
    planable_post_id: item.planable_post_id ?? "",
    planable_group_id: item.planable_group_id ?? "",
    planable_page_ids: Array.isArray(item.planable_page_ids)
      ? item.planable_page_ids
      : [],
    last_synced_at: item.last_synced_at ?? null,
    sync_source: item.sync_source ?? "",
  };
}

export async function listEvents() {
  const store = await readStore();
  return [...store.events].sort((a, b) => {
    if (!a.starts_at && !b.starts_at) return a.title.localeCompare(b.title);
    if (!a.starts_at) return 1;
    if (!b.starts_at) return -1;
    return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
  });
}

export async function createEvent(
  input: Omit<EventItem, "id" | "created_at" | "updated_at">
) {
  const item: EventItem = {
    ...input,
    id: uid("evt"),
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await updateStore((s) => {
    s.events.push(item);
  });
  return item;
}

export async function updateEvent(id: string, patch: Partial<EventItem>) {
  let updated: EventItem | null = null;
  await updateStore((s) => {
    const idx = s.events.findIndex((e) => e.id === id);
    if (idx === -1) return;
    s.events[idx] = {
      ...s.events[idx],
      ...patch,
      id,
      updated_at: nowIso(),
    };
    updated = s.events[idx];
  });
  return updated;
}

export async function deleteEvent(id: string) {
  await updateStore((s) => {
    s.events = s.events.filter((e) => e.id !== id);
    s.event_attendance = s.event_attendance.filter((a) => a.event_id !== id);
  });
}

const ATTENDANCE_STATUSES: EventAttendanceStatus[] = [
  "attending",
  "maybe",
  "not_attending",
  "interested",
];

export function isEventAttendanceStatus(
  value: unknown
): value is EventAttendanceStatus {
  return (
    typeof value === "string" &&
    ATTENDANCE_STATUSES.includes(value as EventAttendanceStatus)
  );
}

export async function listAttendanceForEvent(eventId: string) {
  const store = await readStore();
  return store.event_attendance
    .filter((a) => a.event_id === eventId)
    .sort((a, b) => a.user_name.localeCompare(b.user_name));
}

export async function listAllAttendance() {
  const store = await readStore();
  return [...store.event_attendance].sort((a, b) =>
    a.user_name.localeCompare(b.user_name)
  );
}

export async function upsertEventAttendance(input: {
  event_id: string;
  user_id: string;
  user_name: string;
  attendance_status: EventAttendanceStatus;
}) {
  let row: EventAttendance | null = null;
  await updateStore((s) => {
    const idx = s.event_attendance.findIndex(
      (a) => a.event_id === input.event_id && a.user_id === input.user_id
    );
    if (idx === -1) {
      row = {
        id: uid("att"),
        event_id: input.event_id,
        user_id: input.user_id,
        user_name: input.user_name,
        attendance_status: input.attendance_status,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      s.event_attendance.push(row);
      return;
    }
    s.event_attendance[idx] = {
      ...s.event_attendance[idx],
      user_name: input.user_name || s.event_attendance[idx].user_name,
      attendance_status: input.attendance_status,
      updated_at: nowIso(),
    };
    row = s.event_attendance[idx];
  });
  return row;
}

export async function deleteEventAttendance(eventId: string, userId: string) {
  await updateStore((s) => {
    s.event_attendance = s.event_attendance.filter(
      (a) => !(a.event_id === eventId && a.user_id === userId)
    );
  });
}

export async function listContent() {
  const store = await readStore();
  return store.content.map(withContentPlanableDefaults);
}

export async function createContent(
  input: Omit<ContentItem, "id" | "created_at" | "updated_at">
) {
  const item: ContentItem = {
    ...input,
    id: uid("cnt"),
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await updateStore((s) => {
    s.content.push(item);
  });
  return item;
}

export async function updateContent(
  id: string,
  patch: Partial<ContentItem>
): Promise<ContentItem | null> {
  let updated: ContentItem | null = null;
  await updateStore((s) => {
    const idx = s.content.findIndex((c) => c.id === id);
    if (idx === -1) return;
    const next: ContentItem = {
      ...withContentPlanableDefaults(s.content[idx]),
      ...patch,
      id,
      updated_at: nowIso(),
    };
    s.content[idx] = next;
    updated = next;
  });
  return updated;
}

export async function deleteContent(id: string) {
  await updateStore((s) => {
    s.content = s.content.filter((c) => c.id !== id);
  });
}

export async function moveContentStatus(id: string, status: ContentStatus) {
  return updateContent(id, { status });
}

export async function listSponsorships() {
  const store = await readStore();
  // Backfill kind / ownership fields for older rows
  let changed = false;
  const items = store.sponsorships.map((s) => {
    let next = s;
    if (s.kind !== "sponsorship" && s.kind !== "membership") {
      changed = true;
      next = { ...next, kind: "sponsorship" as const };
    }
    if (
      next.membership_type !== "membership" &&
      next.membership_type !== "directory_listing"
    ) {
      changed = true;
      next = { ...next, membership_type: "membership" as const };
    }
    if (next.created_by === undefined || next.created_by_user_id === undefined) {
      changed = true;
      next = {
        ...next,
        created_by: next.created_by ?? "",
        created_by_user_id: next.created_by_user_id ?? null,
      };
    }
    return next;
  });
  if (changed) {
    await updateStore((st) => {
      st.sponsorships = items;
    });
  }
  return items;
}

export async function createSponsorship(
  input: Omit<Sponsorship, "id" | "created_at" | "updated_at">
) {
  const item: Sponsorship = {
    ...input,
    id: uid("spn"),
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await updateStore((s) => {
    s.sponsorships.push(item);
  });
  return item;
}

export async function getSponsorship(id: string) {
  const store = await readStore();
  const item = store.sponsorships.find((c) => c.id === id);
  if (!item) return null;
  if (item.kind !== "membership" && item.kind !== "sponsorship") {
    return {
      ...item,
      kind: "sponsorship" as const,
      membership_type: "membership" as const,
    };
  }
  if (
    item.membership_type !== "membership" &&
    item.membership_type !== "directory_listing"
  ) {
    return { ...item, membership_type: "membership" as const };
  }
  return item;
}

export async function updateSponsorship(
  id: string,
  patch: Partial<Sponsorship>
) {
  let updated: Sponsorship | null = null;
  await updateStore((s) => {
    const idx = s.sponsorships.findIndex((c) => c.id === id);
    if (idx === -1) return;
    s.sponsorships[idx] = {
      ...s.sponsorships[idx],
      ...patch,
      id,
      updated_at: nowIso(),
    };
    updated = s.sponsorships[idx];
  });
  return updated;
}

export async function deleteSponsorship(id: string) {
  await updateStore((s) => {
    s.sponsorships = s.sponsorships.filter((c) => c.id !== id);
  });
}

export async function setSponsorshipStatus(
  id: string,
  status: SponsorshipStatus
) {
  return updateSponsorship(id, { status });
}

export async function listContacts() {
  const store = await readStore();
  return store.contacts.map(normalizeContact);
}

function normalizeContact(c: Contact): Contact {
  return {
    ...c,
    kind: c.kind === "company" ? "company" : "person",
    website: c.website ?? "",
    services: c.services ?? "",
    user_id: c.user_id ?? null,
    is_press: Boolean(c.is_press),
    beat: c.beat ?? "",
    outlet: c.outlet ?? "",
    country: c.country ?? "",
    preferred_topics: c.preferred_topics ?? "",
    last_contacted_at: c.last_contacted_at ?? null,
    marketing_consent:
      c.marketing_consent === true
        ? true
        : c.marketing_consent === false
          ? false
          : null,
  };
}

export async function getContact(id: string) {
  const store = await readStore();
  const c = store.contacts.find((x) => x.id === id);
  return c ? normalizeContact(c) : null;
}

export async function getContactByUserId(userId: string) {
  const contacts = await listContacts();
  return contacts.find((c) => c.user_id === userId) ?? null;
}

export async function getContactByEmail(email: string) {
  const needle = email.trim().toLowerCase();
  if (!needle) return null;
  const contacts = await listContacts();
  return (
    contacts.find((c) => c.email.trim().toLowerCase() === needle) ?? null
  );
}

/**
 * Link a hub user to at most one contact. Pass null to unlink.
 * Clears the link from any other contact that had this user.
 */
export async function linkUserToContact(
  userId: string,
  contactId: string | null
) {
  let linked: Contact | null = null;
  await updateStore((s) => {
    for (let i = 0; i < s.contacts.length; i++) {
      const c = normalizeContact(s.contacts[i]);
      if (c.user_id === userId) {
        s.contacts[i] = { ...c, user_id: null, updated_at: nowIso() };
      }
    }
    if (!contactId) return;
    const idx = s.contacts.findIndex((c) => c.id === contactId);
    if (idx === -1) return;
    const next = {
      ...normalizeContact(s.contacts[idx]),
      user_id: userId,
      updated_at: nowIso(),
    };
    s.contacts[idx] = next;
    linked = next;
  });
  return linked;
}

/**
 * Match a hub user to a contact by email, or create a contact when missing.
 * Does not steal a contact already linked to a different user.
 */
export async function ensureContactForUser(input: {
  userId: string;
  email: string;
  full_name?: string;
  organisation?: string;
  role?: string;
  notes?: string;
  /** When false, only match/link — do not create. Default true. */
  createIfMissing?: boolean;
}): Promise<Contact | null> {
  const email = input.email.trim().toLowerCase();
  if (!input.userId || !email) return null;

  const existing = await getContactByUserId(input.userId);
  if (existing) return existing;

  const byEmail = await getContactByEmail(email);
  if (byEmail) {
    if (!byEmail.user_id || byEmail.user_id === input.userId) {
      return (await linkUserToContact(input.userId, byEmail.id)) ?? byEmail;
    }
    return null;
  }

  if (input.createIfMissing === false) return null;

  const name =
    (input.full_name ?? "").trim() || email.split("@")[0] || "Contact";
  return createContact({
    name,
    kind: "person",
    organisation: input.organisation ?? "",
    role: input.role ?? "",
    email,
    phone: "",
    website: "",
    services: "",
    tags: [],
    notes: input.notes ?? "",
    user_id: input.userId,
    is_press: false,
    beat: "",
    outlet: "",
    country: "",
    preferred_topics: "",
    last_contacted_at: null,
    marketing_consent: null,
  });
}

export async function createContact(
  input: Omit<Contact, "id" | "created_at" | "updated_at">
) {
  const item: Contact = {
    ...input,
    kind: input.kind === "company" ? "company" : "person",
    website: input.website ?? "",
    services: input.services ?? "",
    user_id: input.user_id ?? null,
    is_press: Boolean(input.is_press),
    beat: input.beat ?? "",
    outlet: input.outlet ?? "",
    country: input.country ?? "",
    preferred_topics: input.preferred_topics ?? "",
    last_contacted_at: input.last_contacted_at ?? null,
    marketing_consent:
      input.marketing_consent === true
        ? true
        : input.marketing_consent === false
          ? false
          : null,
    id: uid("ctc"),
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await updateStore((s) => {
    if (item.user_id) {
      for (let i = 0; i < s.contacts.length; i++) {
        const c = normalizeContact(s.contacts[i]);
        if (c.user_id === item.user_id) {
          s.contacts[i] = { ...c, user_id: null, updated_at: nowIso() };
        }
      }
    }
    s.contacts.push(item);
  });
  return item;
}

export async function updateContact(id: string, patch: Partial<Contact>) {
  let updated: Contact | null = null;
  await updateStore((s) => {
    const idx = s.contacts.findIndex((c) => c.id === id);
    if (idx === -1) return;
    const nextUserId =
      patch.user_id !== undefined
        ? patch.user_id
        : normalizeContact(s.contacts[idx]).user_id;
    if (nextUserId) {
      for (let i = 0; i < s.contacts.length; i++) {
        if (i === idx) continue;
        const c = normalizeContact(s.contacts[i]);
        if (c.user_id === nextUserId) {
          s.contacts[i] = { ...c, user_id: null, updated_at: nowIso() };
        }
      }
    }
    s.contacts[idx] = {
      ...normalizeContact(s.contacts[idx]),
      ...patch,
      id,
      updated_at: nowIso(),
    };
    updated = s.contacts[idx];
  });
  return updated;
}

export async function deleteContact(id: string) {
  await updateStore((s) => {
    s.contacts = s.contacts.filter((c) => c.id !== id);
  });
}

export async function listResources() {
  const store = await readStore();
  return store.resources;
}

export async function createResource(
  input: Omit<ResourceLink, "id" | "created_at" | "updated_at">
) {
  const item: ResourceLink = {
    ...input,
    id: uid("res"),
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await updateStore((s) => {
    s.resources.push(item);
  });
  return item;
}

export async function updateResource(
  id: string,
  patch: Partial<ResourceLink>
) {
  let updated: ResourceLink | null = null;
  await updateStore((s) => {
    const idx = s.resources.findIndex((c) => c.id === id);
    if (idx === -1) return;
    s.resources[idx] = {
      ...s.resources[idx],
      ...patch,
      id,
      updated_at: nowIso(),
    };
    updated = s.resources[idx];
  });
  return updated;
}

export async function deleteResource(id: string) {
  await updateStore((s) => {
    s.resources = s.resources.filter((c) => c.id !== id);
  });
}

export async function listReports() {
  const store = await readStore();
  return store.reports;
}

export async function createReport(
  input: Omit<ReportLink, "id" | "created_at" | "updated_at">
) {
  const item: ReportLink = {
    ...input,
    id: uid("rpt"),
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await updateStore((s) => {
    s.reports.push(item);
  });
  return item;
}

export async function updateReport(id: string, patch: Partial<ReportLink>) {
  let updated: ReportLink | null = null;
  await updateStore((s) => {
    const idx = s.reports.findIndex((c) => c.id === id);
    if (idx === -1) return;
    s.reports[idx] = { ...s.reports[idx], ...patch, id, updated_at: nowIso() };
    updated = s.reports[idx];
  });
  return updated;
}

export async function deleteReport(id: string) {
  await updateStore((s) => {
    s.reports = s.reports.filter((c) => c.id !== id);
  });
}

export async function listPaidCampaigns() {
  const store = await readStore();
  return [...store.paid_campaigns].sort((a, b) => {
    const aDate = a.starts_at ?? a.created_at;
    const bDate = b.starts_at ?? b.created_at;
    return bDate.localeCompare(aDate);
  });
}

export async function getPaidCampaign(id: string) {
  const store = await readStore();
  return store.paid_campaigns.find((c) => c.id === id) ?? null;
}

export async function createPaidCampaign(
  input: Omit<PaidCampaign, "id" | "created_at" | "updated_at">
) {
  const item: PaidCampaign = {
    ...input,
    id: uid("pc"),
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await updateStore((s) => {
    s.paid_campaigns.push(item);
  });
  return item;
}

export async function updatePaidCampaign(
  id: string,
  patch: Partial<PaidCampaign>
) {
  let updated: PaidCampaign | null = null;
  await updateStore((s) => {
    const idx = s.paid_campaigns.findIndex((c) => c.id === id);
    if (idx === -1) return;
    s.paid_campaigns[idx] = {
      ...s.paid_campaigns[idx],
      ...patch,
      id,
      updated_at: nowIso(),
    };
    updated = s.paid_campaigns[idx];
  });
  return updated;
}

export async function deletePaidCampaign(id: string) {
  await updateStore((s) => {
    s.paid_campaigns = s.paid_campaigns.filter((c) => c.id !== id);
  });
}

export async function listAdvertisements() {
  const store = await readStore();
  return [...(store.advertisements ?? [])].sort((a, b) => {
    const aDate = a.starts_at ?? a.created_at;
    const bDate = b.starts_at ?? b.created_at;
    return bDate.localeCompare(aDate);
  });
}

export async function createAdvertisement(
  input: Omit<Advertisement, "id" | "created_at" | "updated_at">
) {
  const item: Advertisement = {
    ...input,
    id: uid("ad"),
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await updateStore((s) => {
    s.advertisements.push(item);
  });
  return item;
}

export async function updateAdvertisement(
  id: string,
  patch: Partial<Advertisement>
) {
  let updated: Advertisement | null = null;
  await updateStore((s) => {
    const idx = s.advertisements.findIndex((c) => c.id === id);
    if (idx === -1) return;
    s.advertisements[idx] = {
      ...s.advertisements[idx],
      ...patch,
      id,
      updated_at: nowIso(),
    };
    updated = s.advertisements[idx];
  });
  return updated;
}

export async function deleteAdvertisement(id: string) {
  await updateStore((s) => {
    s.advertisements = s.advertisements.filter((c) => c.id !== id);
  });
}

function decryptCredential(item: PlatformCredential): PlatformCredential {
  return {
    ...item,
    password: decryptCredentialSecret(item.password),
  };
}

function encryptCredentialFields(
  input: Partial<PlatformCredential>
): Partial<PlatformCredential> {
  if (input.password === undefined) return input;
  return {
    ...input,
    password: encryptCredentialSecret(String(input.password)),
  };
}

export async function listPlatformCredentials() {
  const store = await readStore();
  return [...(store.platform_credentials ?? [])]
    .map(decryptCredential)
    .sort((a, b) => a.platform.localeCompare(b.platform));
}

export async function createPlatformCredential(
  input: Omit<PlatformCredential, "id" | "created_at" | "updated_at">
) {
  const encrypted = encryptCredentialFields(input) as Omit<
    PlatformCredential,
    "id" | "created_at" | "updated_at"
  >;
  const item: PlatformCredential = {
    ...encrypted,
    id: uid("cred"),
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await updateStore((s) => {
    s.platform_credentials.push(item);
  });
  return decryptCredential(item);
}

export async function updatePlatformCredential(
  id: string,
  patch: Partial<PlatformCredential>
) {
  let updated: PlatformCredential | null = null;
  const encryptedPatch = encryptCredentialFields(patch);
  await updateStore((s) => {
    const idx = s.platform_credentials.findIndex((c) => c.id === id);
    if (idx === -1) return;
    s.platform_credentials[idx] = {
      ...s.platform_credentials[idx],
      ...encryptedPatch,
      id,
      updated_at: nowIso(),
    };
    updated = s.platform_credentials[idx];
  });
  return updated ? decryptCredential(updated) : null;
}

export async function deletePlatformCredential(id: string) {
  await updateStore((s) => {
    s.platform_credentials = s.platform_credentials.filter((c) => c.id !== id);
  });
}

export async function listThemes() {
  const store = await readStore();
  const quarterOrder = { Q1: 1, Q2: 2, Q3: 3, Q4: 4 } as const;
  return [...store.themes].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return quarterOrder[a.quarter] - quarterOrder[b.quarter];
  });
}

export async function listThemeMains(themeId?: string) {
  const store = await readStore();
  return themeId
    ? store.theme_mains.filter((m) => m.theme_id === themeId)
    : store.theme_mains;
}

export async function listThemeOffshoots(mainId?: string) {
  const store = await readStore();
  return mainId
    ? store.theme_offshoots.filter((o) => o.main_content_id === mainId)
    : store.theme_offshoots;
}

export async function createTheme(
  input: Omit<QuarterlyTheme, "id" | "created_at" | "updated_at">
) {
  const item: QuarterlyTheme = {
    ...input,
    id: uid("thm"),
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await updateStore((s) => {
    s.themes.push(item);
  });
  return item;
}

export async function updateTheme(id: string, patch: Partial<QuarterlyTheme>) {
  let updated: QuarterlyTheme | null = null;
  await updateStore((s) => {
    const idx = s.themes.findIndex((t) => t.id === id);
    if (idx === -1) return;
    s.themes[idx] = { ...s.themes[idx], ...patch, id, updated_at: nowIso() };
    updated = s.themes[idx];
  });
  return updated;
}

export async function deleteTheme(id: string) {
  await updateStore((s) => {
    const mainIds = s.theme_mains
      .filter((m) => m.theme_id === id)
      .map((m) => m.id);
    s.themes = s.themes.filter((t) => t.id !== id);
    s.theme_mains = s.theme_mains.filter((m) => m.theme_id !== id);
    s.theme_offshoots = s.theme_offshoots.filter(
      (o) => !mainIds.includes(o.main_content_id)
    );
  });
}

export async function createThemeMain(
  input: Omit<ThemeMainContent, "id" | "created_at" | "updated_at">
) {
  const item: ThemeMainContent = {
    ...input,
    content_id: input.content_id ?? null,
    id: uid("tmc"),
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await updateStore((s) => {
    s.theme_mains.push(item);
  });
  return item;
}

/**
 * Create a Content row + Theme main in one store write so neither can be
 * lost to a read/modify/write race between two separate updates.
 */
export async function createThemeMainWithContent(input: {
  theme_id: string;
  title: string;
  channel: string;
  owner: string;
  status: ContentStatus;
  notes?: string;
  content_type?: string;
}): Promise<{ item: ThemeMainContent; content: ContentItem } | null> {
  const themeId = String(input.theme_id ?? "").trim();
  if (!themeId) return null;

  const now = nowIso();
  const title = input.title.trim() || "Main content";
  const channel = input.channel.trim();
  const owner = input.owner.trim();
  const notes = (input.notes ?? "").trim();
  const status = input.status;

  const content: ContentItem = {
    id: uid("cnt"),
    title,
    channel: channel ? [channel] : ["Editorial"],
    content_type: input.content_type?.trim() || "Editorial",
    owner,
    due_date: null,
    deadline_date: null,
    status,
    category: "",
    priority: "",
    website: "",
    caption: "",
    theme_id: themeId,
    planable_url: "",
    planable_post_id: "",
    planable_group_id: "",
    planable_page_ids: [],
    last_synced_at: null,
    sync_source: "",
    asset_url: "",
    notes,
    created_at: now,
    updated_at: now,
  };

  const item: ThemeMainContent = {
    id: uid("tmc"),
    theme_id: themeId,
    content_id: content.id,
    title,
    channel,
    owner,
    status,
    notes,
    created_at: now,
    updated_at: now,
  };

  let created = false;
  await updateStore((s) => {
    if (!s.themes.some((t) => t.id === themeId)) return;
    s.content.push(content);
    s.theme_mains.push(item);
    created = true;
  });
  if (!created) return null;
  return { item, content };
}

/** Create a Content table row for a theme main if missing, and return both. */
export async function ensureThemeMainContentLink(mainId: string) {
  const store = await readStore();
  const main = store.theme_mains.find((m) => m.id === mainId);
  if (!main) return null;

  if (main.content_id) {
    const existing = store.content.find((c) => c.id === main.content_id);
    if (existing) return { main, content: existing };
  }

  const now = nowIso();
  const content: ContentItem = {
    id: uid("cnt"),
    title: main.title,
    channel: main.channel ? [main.channel] : ["Editorial"],
    content_type: "Editorial",
    owner: main.owner ?? "",
    due_date: null,
    deadline_date: null,
    status: main.status,
    category: "",
    priority: "",
    website: "",
    caption: "",
    theme_id: main.theme_id,
    planable_url: "",
    planable_post_id: "",
    planable_group_id: "",
    planable_page_ids: [],
    last_synced_at: null,
    sync_source: "",
    asset_url: "",
    notes: main.notes ?? "",
    created_at: now,
    updated_at: now,
  };

  let updatedMain: ThemeMainContent | null = null;
  await updateStore((s) => {
    const idx = s.theme_mains.findIndex((m) => m.id === mainId);
    if (idx === -1) return;
    s.content.push(content);
    const next: ThemeMainContent = {
      ...s.theme_mains[idx],
      content_id: content.id,
      updated_at: now,
    };
    s.theme_mains[idx] = next;
    updatedMain = next;
  });
  if (!updatedMain) return null;
  return { main: updatedMain, content };
}

export async function updateThemeMain(
  id: string,
  patch: Partial<ThemeMainContent>
): Promise<ThemeMainContent | null> {
  let updated: ThemeMainContent | null = null;
  await updateStore((s) => {
    const idx = s.theme_mains.findIndex((m) => m.id === id);
    if (idx === -1) return;
    const next: ThemeMainContent = {
      ...s.theme_mains[idx],
      ...patch,
      id,
      updated_at: nowIso(),
    };
    s.theme_mains[idx] = next;
    updated = next;
  });
  return updated;
}

export async function deleteThemeMain(id: string) {
  await updateStore((s) => {
    s.theme_mains = s.theme_mains.filter((m) => m.id !== id);
    s.theme_offshoots = s.theme_offshoots.filter(
      (o) => o.main_content_id !== id
    );
  });
}

export async function createThemeOffshoot(
  input: Omit<ThemeOffshoot, "id" | "created_at" | "updated_at">
) {
  const item: ThemeOffshoot = {
    ...input,
    id: uid("tof"),
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await updateStore((s) => {
    s.theme_offshoots.push(item);
  });
  return item;
}

export async function updateThemeOffshoot(
  id: string,
  patch: Partial<ThemeOffshoot>
) {
  let updated: ThemeOffshoot | null = null;
  await updateStore((s) => {
    const idx = s.theme_offshoots.findIndex((o) => o.id === id);
    if (idx === -1) return;
    s.theme_offshoots[idx] = {
      ...s.theme_offshoots[idx],
      ...patch,
      id,
      updated_at: nowIso(),
    };
    updated = s.theme_offshoots[idx];
  });
  return updated;
}

export async function deleteThemeOffshoot(id: string) {
  await updateStore((s) => {
    s.theme_offshoots = s.theme_offshoots.filter((o) => o.id !== id);
  });
}

export async function listMerchOrders() {
  const store = await readStore();
  return [...store.merch_orders].sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  );
}

export async function getMerchOrder(id: string) {
  const store = await readStore();
  return store.merch_orders.find((o) => o.id === id) ?? null;
}

export async function createMerchOrder(
  input: Omit<MerchOrder, "id" | "created_at" | "updated_at">
) {
  const items = normalizeMerchOrderItems(input);
  const primary = syncMerchOrderPrimaryFields(items);
  const item: MerchOrder = {
    ...input,
    ...primary,
    items,
    logo: primary.logo,
    requested_for_contact_id: input.requested_for_contact_id ?? null,
    created_by_user_id: input.created_by_user_id ?? null,
    id: uid("mrc"),
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await updateStore((s) => {
    s.merch_orders.push(item);
  });
  return item;
}

export async function updateMerchOrder(
  id: string,
  patch: Partial<MerchOrder>
) {
  let updated: MerchOrder | null = null;
  await updateStore((s) => {
    const idx = s.merch_orders.findIndex((c) => c.id === id);
    if (idx === -1) return;
    const nextPatch = { ...patch };
    delete nextPatch.id;
    if (nextPatch.items !== undefined) {
      const items = normalizeMerchOrderItems({
        ...s.merch_orders[idx],
        ...nextPatch,
        items: nextPatch.items as MerchOrder["items"],
      });
      Object.assign(nextPatch, syncMerchOrderPrimaryFields(items), { items });
    }
    const nextOwner =
      nextPatch.created_by_user_id !== undefined
        ? nextPatch.created_by_user_id
        : (s.merch_orders[idx].created_by_user_id ?? null);
    const nextContactId =
      nextPatch.requested_for_contact_id !== undefined
        ? nextPatch.requested_for_contact_id
        : (s.merch_orders[idx].requested_for_contact_id ?? null);
    s.merch_orders[idx] = {
      ...s.merch_orders[idx],
      ...nextPatch,
      id,
      requested_for_contact_id: nextContactId,
      created_by_user_id: nextOwner,
      updated_at: nowIso(),
    };
    updated = s.merch_orders[idx];
  });
  return updated;
}

export async function deleteMerchOrder(id: string) {
  await updateStore((s) => {
    s.merch_orders = s.merch_orders.filter((c) => c.id !== id);
  });
}

export async function listMerchCatalogue() {
  const store = await readStore();
  return [...(store.merch_catalogue ?? [])];
}

export type MerchCataloguePatch = {
  image_url?: string;
  label?: string;
  brand?: string;
  material?: string;
  colours?: string[];
  default_colour?: string;
  hidden?: boolean;
};

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeColourList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const colours = value
    .map((c) => (typeof c === "string" ? c.trim() : ""))
    .filter(Boolean);
  return colours;
}

/** True when the row still carries any stored override / image. */
function catalogueRowHasContent(row: MerchCatalogueImage): boolean {
  return Boolean(
    row.hidden ||
      row.image_url?.trim() ||
      row.label?.trim() ||
      row.brand?.trim() ||
      row.material?.trim() ||
      (row.colours && row.colours.length > 0) ||
      row.default_colour?.trim()
  );
}

/**
 * Upsert catalogue overrides for a clothing product.
 * Renaming `label` also rewrites matching merch order / inventory item strings.
 */
export async function upsertMerchCatalogue(
  productId: string,
  patch: MerchCataloguePatch
) {
  const id = productId.trim();
  const base = clothingProductById(id);
  if (!id || !base) return null;

  let updated: MerchCatalogueImage | null = null;
  await updateStore((s) => {
    const list = s.merch_catalogue ?? [];
    const idx = list.findIndex((c) => c.product_id === id);
    const prev = idx >= 0 ? list[idx] : undefined;
    const oldLabel = effectiveProductLabel(id, list) ?? base.label;

    const next: MerchCatalogueImage = {
      product_id: id,
      image_url:
        patch.image_url !== undefined
          ? patch.image_url.trim()
          : (prev?.image_url ?? ""),
      updated_at: nowIso(),
    };

    if (patch.label !== undefined) {
      const label = normalizeOptionalText(patch.label);
      if (label) next.label = label;
    } else if (prev?.label?.trim()) {
      next.label = prev.label.trim();
    }

    if (patch.brand !== undefined) {
      const brand = normalizeOptionalText(patch.brand);
      if (brand) next.brand = brand;
    } else if (prev?.brand?.trim()) {
      next.brand = prev.brand.trim();
    }

    if (patch.material !== undefined) {
      const material = normalizeOptionalText(patch.material);
      if (material) next.material = material;
    } else if (prev?.material?.trim()) {
      next.material = prev.material.trim();
    }

    if (patch.colours !== undefined) {
      const colours = normalizeColourList(patch.colours);
      if (colours && colours.length) next.colours = colours;
    } else if (prev?.colours?.length) {
      next.colours = [...prev.colours];
    }

    if (patch.default_colour !== undefined) {
      const defaultColour = normalizeOptionalText(patch.default_colour);
      if (defaultColour) next.default_colour = defaultColour;
    } else if (prev?.default_colour?.trim()) {
      next.default_colour = prev.default_colour.trim();
    }

    if (patch.hidden !== undefined) {
      if (patch.hidden) next.hidden = true;
    } else if (prev?.hidden) {
      next.hidden = true;
    }

    const newLabel = next.label?.trim() || base.label;
    if (oldLabel !== newLabel) {
      s.merch_orders = s.merch_orders.map((order) =>
        order.item === oldLabel ? { ...order, item: newLabel, updated_at: nowIso() } : order
      );
      s.merch_inventory = s.merch_inventory.map((row) =>
        row.item === oldLabel ? { ...row, item: newLabel, updated_at: nowIso() } : row
      );
    }

    if (!catalogueRowHasContent(next)) {
      s.merch_catalogue = list.filter((c) => c.product_id !== id);
      updated = null;
      return;
    }

    if (idx === -1) {
      s.merch_catalogue = [...list, next];
    } else {
      s.merch_catalogue = list.map((c, i) => (i === idx ? next : c));
    }
    updated = next;
  });
  return updated;
}

export async function upsertMerchCatalogueImage(
  productId: string,
  imageUrl: string
) {
  return upsertMerchCatalogue(productId, { image_url: imageUrl });
}

export async function listMerchInventory() {
  const store = await readStore();
  return [...store.merch_inventory].sort((a, b) => {
    const itemCmp = a.item.localeCompare(b.item);
    if (itemCmp !== 0) return itemCmp;
    const fitCmp = (a.fit || "").localeCompare(b.fit || "");
    if (fitCmp !== 0) return fitCmp;
    return a.size.localeCompare(b.size);
  });
}

export async function createMerchInventoryItem(
  input: Omit<MerchInventoryItem, "id" | "created_at" | "updated_at">
) {
  const item: MerchInventoryItem = {
    ...input,
    id: uid("inv"),
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await updateStore((s) => {
    s.merch_inventory.push(item);
  });
  return item;
}

export async function updateMerchInventoryItem(
  id: string,
  patch: Partial<MerchInventoryItem>
) {
  let updated: MerchInventoryItem | null = null;
  await updateStore((s) => {
    const idx = s.merch_inventory.findIndex((c) => c.id === id);
    if (idx === -1) return;
    s.merch_inventory[idx] = {
      ...s.merch_inventory[idx],
      ...patch,
      id,
      updated_at: nowIso(),
    };
    updated = s.merch_inventory[idx];
  });
  return updated;
}

export async function deleteMerchInventoryItem(id: string) {
  await updateStore((s) => {
    s.merch_inventory = s.merch_inventory.filter((c) => c.id !== id);
  });
}

function normalizeStaffRequest(item: StaffRequest): StaffRequest {
  return {
    ...item,
    category: item.category ?? "",
    attachment_url: item.attachment_url ?? "",
  };
}

export async function listStaffRequests() {
  const store = await readStore();
  return [...store.staff_requests]
    .map(normalizeStaffRequest)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getStaffRequest(id: string) {
  const store = await readStore();
  const item = store.staff_requests.find((c) => c.id === id);
  return item ? normalizeStaffRequest(item) : null;
}

export async function createStaffRequest(
  input: Omit<StaffRequest, "id" | "created_at" | "updated_at">
) {
  const item: StaffRequest = {
    ...input,
    category: input.category ?? "",
    attachment_url: input.attachment_url ?? "",
    id: uid("sr"),
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await updateStore((s) => {
    s.staff_requests.push(item);
  });
  return item;
}

export async function updateStaffRequest(
  id: string,
  patch: Partial<StaffRequest>
) {
  let updated: StaffRequest | null = null;
  await updateStore((s) => {
    const idx = s.staff_requests.findIndex((c) => c.id === id);
    if (idx === -1) return;
    s.staff_requests[idx] = {
      ...s.staff_requests[idx],
      ...patch,
      id,
      updated_at: nowIso(),
    };
    updated = s.staff_requests[idx];
  });
  return updated;
}

export async function deleteStaffRequest(id: string) {
  await updateStore((s) => {
    s.staff_requests = s.staff_requests.filter((c) => c.id !== id);
  });
}

function awardFromEvent(event: EventItem): AwardEntry {
  const year =
    Number(String(event.starts_at).slice(0, 4)) || new Date().getFullYear();
  return {
    id: `awd_from_${event.id}`,
    title: event.title,
    organisation: "",
    category: "",
    year,
    status: "watching",
    ceremony_at: event.starts_at ? event.starts_at.slice(0, 10) : null,
    owner: "",
    event_id: event.id,
    notes: event.notes || "",
    created_at: event.created_at,
    updated_at: event.updated_at,
  };
}

/** Seed awards from Events typed/named as awards when the awards list is empty. */
async function ensureAwardsFromEvents() {
  const store = await readStore();
  if ((store.awards ?? []).length > 0) return;
  const fromEvents = store.events.filter(
    (e) =>
      /award/i.test(e.event_type) ||
      /award/i.test(e.title)
  );
  if (!fromEvents.length) return;
  await updateStore((s) => {
    if ((s.awards ?? []).length > 0) return;
    s.awards = fromEvents.map(awardFromEvent);
  });
}

export async function listAwards() {
  await ensureAwardsFromEvents();
  const store = await readStore();
  return [...(store.awards ?? [])].sort((a, b) => {
    const da = a.ceremony_at || `${a.year}-12-31`;
    const db = b.ceremony_at || `${b.year}-12-31`;
    return da.localeCompare(db);
  });
}

export async function createAward(
  input: Omit<AwardEntry, "id" | "created_at" | "updated_at">
) {
  const item: AwardEntry = {
    ...input,
    id: uid("awd"),
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await updateStore((s) => {
    s.awards.push(item);
  });
  return item;
}

export async function updateAward(id: string, patch: Partial<AwardEntry>) {
  let updated: AwardEntry | null = null;
  await updateStore((s) => {
    const idx = s.awards.findIndex((c) => c.id === id);
    if (idx === -1) return;
    s.awards[idx] = {
      ...s.awards[idx],
      ...patch,
      id,
      updated_at: nowIso(),
    };
    updated = s.awards[idx];
  });
  return updated;
}

export async function deleteAward(id: string) {
  await updateStore((s) => {
    s.awards = s.awards.filter((c) => c.id !== id);
  });
}

export async function listTasks(options?: {
  relatedType?: string;
  relatedId?: string;
}) {
  const store = await readStore();
  let tasks = [...(store.tasks ?? [])]
    .map((t) => ({
      ...t,
      start_date: t.start_date ?? null,
      related_type: t.related_type ?? "",
      related_id: t.related_id ?? null,
    }));
  if (options?.relatedType && options?.relatedId) {
    tasks = tasks.filter(
      (t) =>
        (t.related_type || "") === options.relatedType &&
        t.related_id === options.relatedId
    );
  }
  return tasks.sort((a, b) => {
    const rank = (status: string) => {
      const s = status.trim().toLowerCase();
      if (s === "todo") return 0;
      if (s.includes("wait")) return 1;
      if (s === "doing" || s === "inprogress" || s.includes("progress")) return 2;
      if (
        s === "done" ||
        s === "completed" ||
        s === "complete" ||
        s.includes("complet")
      ) {
        return 9;
      }
      return 5;
    };
    const sr = rank(a.status) - rank(b.status);
    if (sr !== 0) return sr;
    const da = a.due_date || "9999-12-31";
    const db = b.due_date || "9999-12-31";
    return da.localeCompare(db);
  });
}

export async function createTask(
  input: Omit<HubTask, "id" | "created_at" | "updated_at">
) {
  const item: HubTask = {
    ...input,
    start_date: input.start_date || null,
    related_type: input.related_type || "",
    related_id: input.related_id || null,
    id: uid("tsk"),
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await updateStore((s) => {
    if (!s.tasks) s.tasks = [];
    // Idempotent across CAS retries — never insert the same id twice.
    if (s.tasks.some((t) => t.id === item.id)) return;
    s.tasks.push(item);
  });
  return item;
}

export async function updateTask(id: string, patch: Partial<HubTask>) {
  let updated: HubTask | null = null;
  await updateStore((s) => {
    if (!s.tasks) s.tasks = [];
    const idx = s.tasks.findIndex((c) => c.id === id);
    if (idx === -1) return;
    s.tasks[idx] = {
      ...s.tasks[idx],
      ...patch,
      id,
      updated_at: nowIso(),
    };
    updated = s.tasks[idx];
  });
  return updated;
}

export async function deleteTask(id: string) {
  await updateStore((s) => {
    s.tasks = (s.tasks ?? []).filter((c) => c.id !== id);
  });
}

const HUB_ACCESS_ROLES: HubAccessRole[] = ["admin", "member", "external"];

function normalizeHubAccessRole(value: unknown): HubAccessRole {
  const role = String(value ?? "").toLowerCase();
  return HUB_ACCESS_ROLES.includes(role as HubAccessRole)
    ? (role as HubAccessRole)
    : "member";
}

export async function listHubUsers() {
  const store = await readStore();
  return [...(store.hub_users ?? [])].sort((a, b) => {
    const roleOrder = { admin: 0, member: 1, external: 2 } as const;
    const byRole = roleOrder[a.role] - roleOrder[b.role];
    if (byRole !== 0) return byRole;
    return a.full_name.localeCompare(b.full_name);
  });
}

/** Resolve Admin → Users directory role for a signed-in email. */
export async function getHubAccessRoleByEmail(
  email: string
): Promise<HubAccessRole | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const users = await listHubUsers();
  return users.find((u) => u.email === normalized)?.role ?? null;
}

export async function createHubUser(
  input: Omit<HubUser, "id" | "created_at" | "updated_at"> & {
    organisation?: string;
  }
) {
  const item: HubUser = {
    email: input.email.trim().toLowerCase(),
    full_name: input.full_name.trim() || input.email.trim(),
    role: normalizeHubAccessRole(input.role),
    notes: input.notes ?? "",
    last_sign_in_at: input.last_sign_in_at ?? null,
    id: uid("usr"),
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await updateStore((s) => {
    if (!s.hub_users) s.hub_users = [];
    s.hub_users.push(item);
  });
  await ensureContactForUser({
    userId: item.id,
    email: item.email,
    full_name: item.full_name,
    organisation: input.organisation,
    notes: item.notes,
  });
  return item;
}

export async function updateHubUser(id: string, patch: Partial<HubUser>) {
  // Object holder so TS tracks mutations from inside the updateStore callback.
  const result: { updated: HubUser | null; emailChanged: boolean } = {
    updated: null,
    emailChanged: false,
  };
  await updateStore((s) => {
    if (!s.hub_users) s.hub_users = [];
    const idx = s.hub_users.findIndex((u) => u.id === id);
    if (idx === -1) return;
    const next = {
      ...s.hub_users[idx],
      ...patch,
      id,
      updated_at: nowIso(),
    };
    if (patch.role !== undefined) next.role = normalizeHubAccessRole(patch.role);
    if (patch.email !== undefined) {
      next.email = patch.email.trim().toLowerCase();
      result.emailChanged = next.email !== s.hub_users[idx].email;
    }
    if (patch.full_name !== undefined) next.full_name = patch.full_name.trim();
    s.hub_users[idx] = next;
    result.updated = s.hub_users[idx];
  });
  if (result.updated && result.emailChanged) {
    await ensureContactForUser({
      userId: result.updated.id,
      email: result.updated.email,
      full_name: result.updated.full_name,
      notes: result.updated.notes,
      createIfMissing: false,
    });
  }
  return result.updated;
}

export async function deleteHubUser(id: string) {
  await updateStore((s) => {
    s.hub_users = (s.hub_users ?? []).filter((u) => u.id !== id);
  });
}

export async function listAccessRequests() {
  const store = await readStore();
  return [...(store.access_requests ?? [])].sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  );
}

export async function createAccessRequest(
  input: Omit<AccessRequest, "id" | "created_at" | "updated_at">
) {
  const item: AccessRequest = {
    ...input,
    email: input.email.trim().toLowerCase(),
    full_name: input.full_name.trim() || input.email.trim(),
    organisation: input.organisation ?? "",
    reason: input.reason ?? "",
    id: uid("ar"),
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await updateStore((s) => {
    if (!s.access_requests) s.access_requests = [];
    s.access_requests.push(item);
  });
  return item;
}

export async function updateAccessRequest(
  id: string,
  patch: Partial<AccessRequest>
) {
  let updated: AccessRequest | null = null;
  await updateStore((s) => {
    if (!s.access_requests) s.access_requests = [];
    const idx = s.access_requests.findIndex((r) => r.id === id);
    if (idx === -1) return;
    s.access_requests[idx] = {
      ...s.access_requests[idx],
      ...patch,
      id,
      updated_at: nowIso(),
    };
    updated = s.access_requests[idx];
  });
  return updated;
}

export async function deleteAccessRequest(id: string) {
  await updateStore((s) => {
    s.access_requests = (s.access_requests ?? []).filter((r) => r.id !== id);
  });
}

export async function findPendingAccessRequestByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  const all = await listAccessRequests();
  return (
    all.find((r) => r.email === normalized && r.status === "pending") ?? null
  );
}

function sortBudgetLines(lines: BudgetLine[]) {
  return [...lines].sort((a, b) => {
    if (a.group !== b.group) {
      return a.group === "committed" ? -1 : 1;
    }
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.name.localeCompare(b.name);
  });
}

export async function listBudgetLines() {
  const store = await readStore();
  return sortBudgetLines(store.budget_lines ?? []);
}

export async function getBudgetMeta() {
  const store = await readStore();
  return store.budget_meta;
}

export async function createBudgetLine(
  input: Omit<BudgetLine, "id" | "created_at" | "updated_at">
) {
  const item: BudgetLine = {
    ...input,
    id: uid("bln"),
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await updateStore((s) => {
    if (!s.budget_lines) s.budget_lines = [];
    s.budget_lines.push(item);
  });
  return item;
}

export async function updateBudgetLine(
  id: string,
  patch: Partial<
    Pick<
      BudgetLine,
      | "name"
      | "code"
      | "group"
      | "planned"
      | "marketing"
      | "sponsorship"
      | "travel"
      | "prior_year"
      | "notes"
      | "sort_order"
      | "children"
    >
  >
) {
  let updated: BudgetLine | null = null;
  await updateStore((s) => {
    if (!s.budget_lines) s.budget_lines = [];
    const idx = s.budget_lines.findIndex((line) => line.id === id);
    if (idx === -1) return;
    s.budget_lines[idx] = {
      ...s.budget_lines[idx],
      ...patch,
      id,
      updated_at: nowIso(),
    };
    updated = s.budget_lines[idx];
  });
  return updated;
}

export async function deleteBudgetLine(id: string) {
  await updateStore((s) => {
    s.budget_lines = (s.budget_lines ?? []).filter((line) => line.id !== id);
    s.budget_payments = (s.budget_payments ?? []).filter(
      (payment) => payment.budget_line_id !== id
    );
  });
}

export async function listBudgetPayments() {
  const store = await readStore();
  return [...(store.budget_payments ?? [])].sort((a, b) => {
    const aDate = a.paid_at ?? a.created_at;
    const bDate = b.paid_at ?? b.created_at;
    return bDate.localeCompare(aDate);
  });
}

export async function createBudgetPayment(
  input: Omit<BudgetPayment, "id" | "created_at" | "updated_at">
) {
  const item: BudgetPayment = {
    ...input,
    id: uid("pay"),
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await updateStore((s) => {
    if (!s.budget_payments) s.budget_payments = [];
    s.budget_payments.push(item);
  });
  return item;
}

export async function updateBudgetPayment(
  id: string,
  patch: Partial<
    Pick<
      BudgetPayment,
      | "budget_line_id"
      | "paid_at"
      | "supplier"
      | "description"
      | "amount"
      | "status"
      | "invoice_url"
    >
  >
) {
  let updated: BudgetPayment | null = null;
  await updateStore((s) => {
    if (!s.budget_payments) s.budget_payments = [];
    const idx = s.budget_payments.findIndex((payment) => payment.id === id);
    if (idx === -1) return;
    s.budget_payments[idx] = {
      ...s.budget_payments[idx],
      ...patch,
      id,
      updated_at: nowIso(),
    };
    updated = s.budget_payments[idx];
  });
  return updated;
}

export async function deleteBudgetPayment(id: string) {
  await updateStore((s) => {
    s.budget_payments = (s.budget_payments ?? []).filter(
      (payment) => payment.id !== id
    );
  });
}

// —— PR module (media lists, pitches, coverage, monitoring) ——

function normalizeMediaList(list: MediaList): MediaList {
  const kind =
    list.list_kind === "marketing" || list.list_kind === "mixed"
      ? list.list_kind
      : "press";
  return {
    ...list,
    contact_ids: Array.isArray(list.contact_ids) ? list.contact_ids : [],
    list_kind: kind,
    source: list.source ?? "",
  };
}

function normalizePrPitch(p: PrPitch): PrPitch {
  const listIds = Array.isArray(p.list_ids)
    ? p.list_ids
    : p.media_list_id
      ? [p.media_list_id]
      : [];
  const status =
    p.status === "exported" ||
    p.status === "sent_external" ||
    p.status === "archived"
      ? p.status
      : "draft";
  return {
    ...p,
    status,
    channel: p.channel === "marketing" ? "marketing" : "pr",
    preview_text: p.preview_text ?? "",
    from_name: p.from_name ?? "Peters & May Marketing",
    from_email: p.from_email ?? "marketing@petersandmay.com",
    campaign_tag: p.campaign_tag ?? "",
    theme_id: p.theme_id ?? null,
    media_list_id: p.media_list_id ?? listIds[0] ?? null,
    list_ids: listIds,
    recipient_ids: Array.isArray(p.recipient_ids) ? p.recipient_ids : [],
    content_id: p.content_id ?? null,
    event_id: p.event_id ?? null,
    exported_at: p.exported_at ?? null,
    hubspot_url: p.hubspot_url ?? "",
    parent_draft_id: p.parent_draft_id ?? null,
    notes: p.notes ?? "",
    created_by: p.created_by ?? "",
  };
}

export async function listMediaLists() {
  const store = await readStore();
  return [...(store.media_lists ?? [])]
    .map(normalizeMediaList)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function createMediaList(
  input: Omit<MediaList, "id" | "created_at" | "updated_at">
) {
  const item = normalizeMediaList({
    ...input,
    contact_ids: Array.isArray(input.contact_ids) ? input.contact_ids : [],
    list_kind: input.list_kind ?? "press",
    source: input.source ?? "",
    id: uid("ml"),
    created_at: nowIso(),
    updated_at: nowIso(),
  });
  await updateStore((s) => {
    if (!s.media_lists) s.media_lists = [];
    s.media_lists.push(item);
  });
  return item;
}

export async function updateMediaList(id: string, patch: Partial<MediaList>) {
  let updated: MediaList | null = null;
  await updateStore((s) => {
    if (!s.media_lists) s.media_lists = [];
    const idx = s.media_lists.findIndex((x) => x.id === id);
    if (idx === -1) return;
    s.media_lists[idx] = normalizeMediaList({
      ...normalizeMediaList(s.media_lists[idx]),
      ...patch,
      id,
      contact_ids: Array.isArray(patch.contact_ids)
        ? patch.contact_ids
        : s.media_lists[idx].contact_ids,
      updated_at: nowIso(),
    });
    updated = s.media_lists[idx];
  });
  return updated;
}

export async function deleteMediaList(id: string) {
  await updateStore((s) => {
    s.media_lists = (s.media_lists ?? []).filter((x) => x.id !== id);
  });
}

export async function listPrPitches() {
  const store = await readStore();
  return [...(store.pr_pitches ?? [])]
    .map(normalizePrPitch)
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
}

export async function createPrPitch(
  input: Omit<PrPitch, "id" | "created_at" | "updated_at">
) {
  const listIds = Array.isArray(input.list_ids)
    ? input.list_ids
    : input.media_list_id
      ? [input.media_list_id]
      : [];
  const item = normalizePrPitch({
    ...input,
    status: (input.status as PrPitchStatus) || "draft",
    channel: input.channel === "marketing" ? "marketing" : "pr",
    preview_text: input.preview_text ?? "",
    from_name: input.from_name ?? "Peters & May Marketing",
    from_email: input.from_email ?? "marketing@petersandmay.com",
    campaign_tag: input.campaign_tag ?? "",
    theme_id: input.theme_id ?? null,
    media_list_id: input.media_list_id ?? listIds[0] ?? null,
    list_ids: listIds,
    recipient_ids: Array.isArray(input.recipient_ids)
      ? input.recipient_ids
      : [],
    content_id: input.content_id ?? null,
    event_id: input.event_id ?? null,
    exported_at: input.exported_at ?? null,
    hubspot_url: input.hubspot_url ?? "",
    parent_draft_id: input.parent_draft_id ?? null,
    notes: input.notes ?? "",
    created_by: input.created_by ?? "",
    id: uid("pitch"),
    created_at: nowIso(),
    updated_at: nowIso(),
  });
  await updateStore((s) => {
    if (!s.pr_pitches) s.pr_pitches = [];
    s.pr_pitches.push(item);
  });
  return item;
}

export async function updatePrPitch(id: string, patch: Partial<PrPitch>) {
  let updated: PrPitch | null = null;
  await updateStore((s) => {
    if (!s.pr_pitches) s.pr_pitches = [];
    const idx = s.pr_pitches.findIndex((x) => x.id === id);
    if (idx === -1) return;
    s.pr_pitches[idx] = normalizePrPitch({
      ...normalizePrPitch(s.pr_pitches[idx]),
      ...patch,
      id,
      updated_at: nowIso(),
    });
    updated = s.pr_pitches[idx];
  });
  return updated;
}

export async function deletePrPitch(id: string) {
  await updateStore((s) => {
    s.pr_pitches = (s.pr_pitches ?? []).filter((x) => x.id !== id);
  });
}

export async function listPrCoverage() {
  const store = await readStore();
  return [...(store.pr_coverage ?? [])].sort((a, b) => {
    const da = a.published_at || a.created_at;
    const db = b.published_at || b.created_at;
    return new Date(db).getTime() - new Date(da).getTime();
  });
}

export async function createPrCoverage(
  input: Omit<PrCoverage, "id" | "created_at" | "updated_at">
) {
  const item: PrCoverage = {
    ...input,
    sentiment: (input.sentiment as PrCoverageSentiment) || "",
    pitch_id: input.pitch_id ?? null,
    content_id: input.content_id ?? null,
    event_id: input.event_id ?? null,
    monitor_mention_id: input.monitor_mention_id ?? null,
    id: uid("cov"),
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await updateStore((s) => {
    if (!s.pr_coverage) s.pr_coverage = [];
    s.pr_coverage.push(item);
  });
  return item;
}

export async function updatePrCoverage(
  id: string,
  patch: Partial<PrCoverage>
) {
  let updated: PrCoverage | null = null;
  await updateStore((s) => {
    if (!s.pr_coverage) s.pr_coverage = [];
    const idx = s.pr_coverage.findIndex((x) => x.id === id);
    if (idx === -1) return;
    s.pr_coverage[idx] = {
      ...s.pr_coverage[idx],
      ...patch,
      id,
      updated_at: nowIso(),
    };
    updated = s.pr_coverage[idx];
  });
  return updated;
}

export async function deletePrCoverage(id: string) {
  await updateStore((s) => {
    s.pr_coverage = (s.pr_coverage ?? []).filter((x) => x.id !== id);
  });
}

export async function listPrMonitorQueries() {
  const store = await readStore();
  return [...(store.pr_monitor_queries ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

export async function createPrMonitorQuery(
  input: Omit<PrMonitorQuery, "id" | "created_at" | "updated_at">
) {
  const item: PrMonitorQuery = {
    ...input,
    active: input.active !== false,
    last_run_at: input.last_run_at ?? null,
    id: uid("pmq"),
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await updateStore((s) => {
    if (!s.pr_monitor_queries) s.pr_monitor_queries = [];
    s.pr_monitor_queries.push(item);
  });
  return item;
}

export async function updatePrMonitorQuery(
  id: string,
  patch: Partial<PrMonitorQuery>
) {
  let updated: PrMonitorQuery | null = null;
  await updateStore((s) => {
    if (!s.pr_monitor_queries) s.pr_monitor_queries = [];
    const idx = s.pr_monitor_queries.findIndex((x) => x.id === id);
    if (idx === -1) return;
    s.pr_monitor_queries[idx] = {
      ...s.pr_monitor_queries[idx],
      ...patch,
      id,
      updated_at: nowIso(),
    };
    updated = s.pr_monitor_queries[idx];
  });
  return updated;
}

export async function deletePrMonitorQuery(id: string) {
  await updateStore((s) => {
    s.pr_monitor_queries = (s.pr_monitor_queries ?? []).filter(
      (x) => x.id !== id
    );
  });
}

export async function listPrMonitorMentions() {
  const store = await readStore();
  return [...(store.pr_monitor_mentions ?? [])].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export async function upsertPrMonitorMentions(
  mentions: Omit<PrMonitorMention, "id" | "created_at" | "updated_at">[]
) {
  const created: PrMonitorMention[] = [];
  await updateStore((s) => {
    if (!s.pr_monitor_mentions) s.pr_monitor_mentions = [];
    const byExternal = new Map(
      s.pr_monitor_mentions.map((m) => [m.external_id, m])
    );
    for (const input of mentions) {
      if (input.external_id && byExternal.has(input.external_id)) continue;
      const item: PrMonitorMention = {
        ...input,
        status: (input.status as PrMonitorMentionStatus) || "new",
        id: uid("pmm"),
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      s.pr_monitor_mentions.push(item);
      byExternal.set(item.external_id, item);
      created.push(item);
    }
  });
  return created;
}

export async function updatePrMonitorMention(
  id: string,
  patch: Partial<PrMonitorMention>
) {
  let updated: PrMonitorMention | null = null;
  await updateStore((s) => {
    if (!s.pr_monitor_mentions) s.pr_monitor_mentions = [];
    const idx = s.pr_monitor_mentions.findIndex((x) => x.id === id);
    if (idx === -1) return;
    s.pr_monitor_mentions[idx] = {
      ...s.pr_monitor_mentions[idx],
      ...patch,
      id,
      updated_at: nowIso(),
    };
    updated = s.pr_monitor_mentions[idx];
  });
  return updated;
}

export async function deletePrMonitorMention(id: string) {
  await updateStore((s) => {
    s.pr_monitor_mentions = (s.pr_monitor_mentions ?? []).filter(
      (x) => x.id !== id
    );
  });
}

/** Published PR / press-release content for the public newsroom. */
export async function listPublishedPressReleases() {
  const store = await readStore();
  return store.content
    .map(withContentPlanableDefaults)
    .filter((c) => {
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
    })
    .sort((a, b) => {
      const da = a.due_date || a.updated_at;
      const db = b.due_date || b.updated_at;
      return new Date(db).getTime() - new Date(da).getTime();
    });
}

export async function getNewsroomSettings(): Promise<NewsroomSettings> {
  const store = await readStore();
  return normalizeNewsroomSettings(store.newsroom_settings);
}

export async function updateNewsroomSettings(
  patch: Partial<NewsroomSettings>
): Promise<NewsroomSettings> {
  let next: NewsroomSettings = normalizeNewsroomSettings(patch);
  await updateStore((s) => {
    next = normalizeNewsroomSettings({
      ...s.newsroom_settings,
      ...patch,
      updated_at: nowIso(),
    });
    s.newsroom_settings = next;
  });
  return next;
}
