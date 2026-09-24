import {
  addEmailSuppression,
  createContact,
  createEmailAudience,
  createMediaList,
  getContactByEmail,
  getEmailCampaign,
  listContacts,
  listEmailAudiences,
  listEmailEvents,
  listMediaLists,
  updateContact,
  updateEmailAudience,
  updateMediaList,
} from "@/lib/data/repos";
import type { Contact, EmailSuppressionReason } from "@/lib/types";

const PORTAL_LIST_NAME = "Portal customers";
const PAGE_LIMIT = 500;
const MAX_PAGES = 40;

type AudienceContact = {
  id: string;
  email_normalized: string;
  name: string | null;
  primary_company: string | null;
};

type AudiencePage = {
  contacts?: AudienceContact[];
  next_cursor?: string | null;
  retired?: { merged_email: string; kept_contact_id: string; created_at: string }[];
  suppressed?: {
    id: string;
    email_normalized: string;
    marketing_suppressed_reason: EmailSuppressionReason | null;
  }[];
  erased?: { email_normalized: string; contact_id: string | null; erased_at: string }[];
};

export type PortalAudienceSyncResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  upserted: number;
  removed: number;
  error?: string;
};

function portalBaseUrl(): string {
  return (process.env.PORTAL_BASE_URL ?? "").trim().replace(/\/+$/, "");
}

function portalSyncSecret(): string {
  return (process.env.PORTAL_ENQUIRY_SYNC_SECRET ?? "").trim();
}

export function hubAppOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ?? "https://marketing.petersandmay.com"
  )
    .trim()
    .replace(/\/+$/, "");
}

export function hubContactRecordUrl(contactId: string): string {
  return `${hubAppOrigin()}/app/contacts?id=${encodeURIComponent(contactId)}`;
}

export function hubCampaignUrl(campaignId: string): string {
  return `${hubAppOrigin()}/app/email?campaign=${encodeURIComponent(campaignId)}`;
}

type PortalCallResult =
  | { ok: true; skipped?: boolean; reason?: string; body?: unknown }
  | { ok: false; error: string; status?: number; body?: unknown };

async function portalFetch(
  path: string,
  init?: RequestInit
): Promise<PortalCallResult> {
  const base = portalBaseUrl();
  const secret = portalSyncSecret();
  if (!base || !secret) {
    return {
      ok: true,
      skipped: true,
      reason: "PORTAL_BASE_URL or PORTAL_ENQUIRY_SYNC_SECRET not set",
    };
  }
  try {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${secret}`,
        "X-Webhook-Secret": secret,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      const error = text.slice(0, 400) || `Portal HTTP ${res.status}`;
      console.error("[portal-marketing]", path, res.status, error);
      return { ok: false, error, status: res.status };
    }
    if (!text) return { ok: true, body: null };
    try {
      return { ok: true, body: JSON.parse(text) as unknown };
    } catch {
      return { ok: true, body: null };
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : "Portal request failed";
    console.error("[portal-marketing]", path, error);
    return { ok: false, error };
  }
}

async function postPortalMarketing(
  body: Record<string, unknown>
): Promise<PortalCallResult> {
  return portalFetch("/api/marketing/hub-sync", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function blankContact(
  email: string,
  name: string,
  organisation: string,
  portalContactId: string
): Omit<Contact, "id" | "created_at" | "updated_at"> {
  return {
    kind: "person",
    name,
    organisation,
    role: "",
    email,
    phone: "",
    website: "",
    services: "",
    tags: ["portal"],
    notes: "",
    user_id: null,
    is_press: false,
    beat: "",
    outlet: "",
    country: "",
    preferred_topics: "",
    last_contacted_at: null,
    marketing_consent: true,
    portal_contact_id: portalContactId,
  };
}

async function upsertPortalContact(row: AudienceContact): Promise<Contact> {
  const email = row.email_normalized.trim().toLowerCase();
  const name = (row.name ?? "").trim() || email;
  const organisation = (row.primary_company ?? "").trim();
  const existing = await getContactByEmail(email);
  if (!existing) {
    return createContact(blankContact(email, name, organisation, row.id));
  }
  const tags = existing.tags.includes("portal")
    ? existing.tags
    : [...existing.tags, "portal"];
  const updated = await updateContact(existing.id, {
    portal_contact_id: row.id,
    marketing_consent: true,
    name: existing.name.trim() || name,
    organisation: existing.organisation.trim() || organisation,
    tags,
  });
  return updated ?? existing;
}

async function dropPortalEmail(
  email: string,
  reason: EmailSuppressionReason
): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  const contact = await getContactByEmail(normalized);
  if (!contact?.portal_contact_id) return false;
  await addEmailSuppression({
    email: normalized,
    reason,
    contact_id: contact.id,
  });
  if (contact.marketing_consent !== false) {
    await updateContact(contact.id, { marketing_consent: false });
  }
  return true;
}

async function pullAudience(updatedSince: string | null): Promise<{
  contacts: AudienceContact[];
  page: AudiencePage | null;
}> {
  const contacts: AudienceContact[] = [];
  let cursor: string | null = null;
  let first: AudiencePage | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params = new URLSearchParams({ limit: String(PAGE_LIMIT) });
    if (cursor) params.set("cursor", cursor);
    if (updatedSince && page === 0) params.set("updated_since", updatedSince);
    const result = await portalFetch(`/api/marketing/audience?${params.toString()}`);
    if (result.ok && result.skipped) {
      return { contacts: [], page: null };
    }
    if (!result.ok) {
      throw new Error(result.error || "Portal audience request failed");
    }
    const body = (result.body ?? {}) as AudiencePage;
    if (page === 0) first = body;
    const batch = Array.isArray(body.contacts) ? body.contacts : [];
    contacts.push(...batch);
    cursor = body.next_cursor ?? null;
    if (!cursor || batch.length === 0) break;
  }
  return { contacts, page: first };
}

async function replacePortalAudience(contactIds: string[]) {
  const lists = await listMediaLists();
  let list = lists.find((item) => item.name === PORTAL_LIST_NAME && item.source === "portal");
  if (!list) {
    list = await createMediaList({
      name: PORTAL_LIST_NAME,
      description: "Portal customers with a marketing opt-in.",
      contact_ids: contactIds,
      list_kind: "marketing",
      source: "portal",
    });
  } else {
    await updateMediaList(list.id, { contact_ids: contactIds });
  }

  const audiences = await listEmailAudiences();
  const audience = audiences.find((item) => item.name === PORTAL_LIST_NAME);
  if (!audience) {
    await createEmailAudience({
      name: PORTAL_LIST_NAME,
      description: "People on the Portal who opted in to marketing.",
      list_ids: [list.id],
      contact_ids: [],
      filter: { tags: [], country: "" },
      exclude_unsubscribed: true,
    });
  } else if (!audience.list_ids.includes(list.id)) {
    await updateEmailAudience(audience.id, {
      list_ids: [...audience.list_ids, list.id],
      exclude_unsubscribed: true,
    });
  }
}

export async function syncPortalMarketingAudience(): Promise<PortalAudienceSyncResult> {
  if (!portalBaseUrl() || !portalSyncSecret()) {
    return {
      ok: true,
      skipped: true,
      reason: "PORTAL_BASE_URL or PORTAL_ENQUIRY_SYNC_SECRET not set",
      upserted: 0,
      removed: 0,
    };
  }

  try {
    const lists = await listMediaLists();
    const existing = lists.find(
      (item) => item.name === PORTAL_LIST_NAME && item.source === "portal"
    );
    const updatedSince = existing?.updated_at ?? null;
    const { contacts, page } = await pullAudience(updatedSince);
    if (!page && contacts.length === 0 && !portalBaseUrl()) {
      return {
        ok: true,
        skipped: true,
        reason: "PORTAL_BASE_URL or PORTAL_ENQUIRY_SYNC_SECRET not set",
        upserted: 0,
        removed: 0,
      };
    }

    const keptEmails = new Set<string>();
    const hubIds: string[] = [];
    for (const row of contacts) {
      const email = row.email_normalized.trim().toLowerCase();
      if (!email) continue;
      keptEmails.add(email);
      const hub = await upsertPortalContact(row);
      hubIds.push(hub.id);
      const linked = await postPortalMarketing({
        event: "link",
        contact_id: row.id,
        email,
        hub_contact_id: hub.id,
        hub_contact_url: hubContactRecordUrl(hub.id),
      });
      if (!linked.ok) {
        console.error("[portal-marketing] link", email, linked.error);
      }
    }

    let removed = 0;
    const current = await listContacts();
    for (const contact of current) {
      if (!contact.portal_contact_id) continue;
      const email = contact.email.trim().toLowerCase();
      if (keptEmails.has(email)) continue;
      if (await dropPortalEmail(email, "unsubscribe")) removed += 1;
    }

    for (const row of page?.suppressed ?? []) {
      const reason = row.marketing_suppressed_reason ?? "unsubscribe";
      if (await dropPortalEmail(row.email_normalized, reason)) removed += 1;
    }
    for (const row of page?.retired ?? []) {
      if (await dropPortalEmail(row.merged_email, "unsubscribe")) removed += 1;
    }
    for (const row of page?.erased ?? []) {
      if (await dropPortalEmail(row.email_normalized, "unsubscribe")) removed += 1;
    }

    await replacePortalAudience(hubIds);

    return { ok: true, upserted: hubIds.length, removed };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Portal audience sync failed";
    console.error("[portal-marketing]", error);
    return { ok: false, upserted: 0, removed: 0, error };
  }
}

export async function notifyPortalCampaignSend(input: {
  contact: Contact;
  campaignId: string;
  campaignTitle: string;
  sentAt: string;
}): Promise<void> {
  if (!input.contact.portal_contact_id) return;
  const result = await postPortalMarketing({
    event: "send",
    contact_id: input.contact.portal_contact_id,
    email: input.contact.email.trim().toLowerCase(),
    hub_campaign_id: input.campaignId,
    campaign_title: input.campaignTitle,
    campaign_url: hubCampaignUrl(input.campaignId),
    sent_at: input.sentAt,
  });
  if (!result.ok) {
    console.error("[portal-marketing] send", input.contact.email, result.error);
  }
}

export async function notifyPortalSuppression(input: {
  email: string;
  portalContactId?: string | null;
  reason: EmailSuppressionReason;
  suppressedAt?: string;
}): Promise<void> {
  const email = input.email.trim().toLowerCase();
  if (!email) return;
  const result = await postPortalMarketing({
    event: "suppress",
    contact_id: input.portalContactId ?? null,
    email,
    reason: input.reason,
    suppressed_at: input.suppressedAt ?? new Date().toISOString(),
  });
  if (!result.ok) {
    console.error("[portal-marketing] suppress", email, result.error);
  }
}

/** Replay recent sends. Portal treats a repeat as success. */
export async function backfillPortalCampaignSends(limit = 100): Promise<void> {
  if (!portalBaseUrl() || !portalSyncSecret()) return;
  const events = (await listEmailEvents()).filter((event) => event.kind === "sent");
  const contacts = await listContacts();
  let posted = 0;
  for (const event of events) {
    if (posted >= limit) break;
    const contact =
      contacts.find((item) => item.id === event.contact_id) ??
      contacts.find(
        (item) => item.email.trim().toLowerCase() === event.email.trim().toLowerCase()
      );
    if (!contact?.portal_contact_id) continue;
    const campaign = await getEmailCampaign(event.campaign_id);
    await notifyPortalCampaignSend({
      contact,
      campaignId: event.campaign_id,
      campaignTitle: campaign?.title || "Marketing email",
      sentAt: event.created_at,
    });
    posted += 1;
  }
}
