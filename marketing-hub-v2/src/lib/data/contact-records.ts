import type { Contact } from "@/lib/types";
import { createServiceClient, hasServiceRoleKey } from "@/lib/supabase/admin";

const TABLE = "hub_contact_records";
const PAGE = 1000;

let split = false;

type RpcError = { code?: string; message?: string };

function missingContactStore(error: RpcError): boolean {
  const message = error.message ?? "";
  return (
    error.code === "PGRST202" ||
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    /schema cache|Could not find|hub_contacts_|hub_contact_records|hub_store_read_core/i.test(
      message
    )
  );
}

export function hubContactsAreSplit(): boolean {
  return split;
}

/** Copy document contacts into the table, then drop them from the document. */
export async function ensureHubContactsSplit(): Promise<boolean> {
  if (split) return true;
  if (!hasServiceRoleKey()) return false;
  const supabase = createServiceClient();
  const { error } = await supabase.rpc("hub_contacts_detach");
  if (error) {
    if (missingContactStore(error)) return false;
    console.error("[contacts] detach failed", error.message);
    return false;
  }
  split = true;
  return true;
}

function asContact(payload: unknown): Contact | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const row = payload as Contact;
  if (!row.id) return null;
  return row;
}

function toRow(contact: Contact) {
  const email = (contact.email || "").trim().toLowerCase();
  return {
    id: contact.id,
    email,
    user_id: contact.user_id ?? null,
    portal_contact_id: contact.portal_contact_id ?? null,
    marketing_consent:
      contact.marketing_consent === true
        ? true
        : contact.marketing_consent === false
          ? false
          : null,
    payload: { ...contact, email },
    updated_at: contact.updated_at || new Date().toISOString(),
  };
}

export async function listContactRecords(): Promise<Contact[] | null> {
  if (!(await ensureHubContactsSplit())) return null;
  const supabase = createServiceClient();
  const all: Contact[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(TABLE)
      .select("payload")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) {
      if (missingContactStore(error)) return null;
      throw new Error(error.message);
    }
    for (const row of data ?? []) {
      const contact = asContact(row.payload);
      if (contact) all.push(contact);
    }
    if (!data || data.length < PAGE) break;
  }
  return all;
}

export async function countContactRecords(): Promise<number | null> {
  if (!(await ensureHubContactsSplit())) return null;
  const supabase = createServiceClient();
  const { count, error } = await supabase
    .from(TABLE)
    .select("id", { count: "exact", head: true });
  if (error) {
    if (missingContactStore(error)) return null;
    throw new Error(error.message);
  }
  return count ?? 0;
}

export async function getContactRecord(
  id: string
): Promise<Contact | null | undefined> {
  if (!(await ensureHubContactsSplit())) return undefined;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("payload")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (missingContactStore(error)) return undefined;
    throw new Error(error.message);
  }
  return data ? asContact(data.payload) : null;
}

export async function getContactRecordByEmail(
  email: string
): Promise<Contact | null | undefined> {
  const needle = email.trim().toLowerCase();
  if (!needle) return null;
  if (!(await ensureHubContactsSplit())) return undefined;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("payload")
    .eq("email", needle)
    .limit(1);
  if (error) {
    if (missingContactStore(error)) return undefined;
    throw new Error(error.message);
  }
  return data?.[0] ? asContact(data[0].payload) : null;
}

/** Name lookups for a small set of addresses. Avoids paging the whole table. */
export async function listContactRecordsByEmails(
  emails: string[]
): Promise<Contact[] | null> {
  const needles = [
    ...new Set(
      emails
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
  if (needles.length === 0) return [];
  if (!(await ensureHubContactsSplit())) return null;
  const supabase = createServiceClient();
  const all: Contact[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < needles.length; index += 100) {
    const chunk = needles.slice(index, index + 100);
    const { data, error } = await supabase
      .from(TABLE)
      .select("payload")
      .in("email", chunk);
    if (error) {
      if (missingContactStore(error)) return null;
      throw new Error(error.message);
    }
    for (const row of data ?? []) {
      const contact = asContact(row.payload);
      if (!contact) continue;
      const email = (contact.email || "").trim().toLowerCase();
      if (!email || seen.has(email)) continue;
      seen.add(email);
      all.push(contact);
    }
  }
  return all;
}

export async function getContactRecordByUserId(
  userId: string
): Promise<Contact | null | undefined> {
  if (!userId) return null;
  if (!(await ensureHubContactsSplit())) return undefined;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("payload")
    .eq("user_id", userId)
    .limit(1);
  if (error) {
    if (missingContactStore(error)) return undefined;
    throw new Error(error.message);
  }
  return data?.[0] ? asContact(data[0].payload) : null;
}

export async function upsertContactRecords(contacts: Contact[]): Promise<boolean> {
  if (contacts.length === 0) return true;
  if (!(await ensureHubContactsSplit())) return false;
  const supabase = createServiceClient();
  for (let index = 0; index < contacts.length; index += 200) {
    const rows = contacts.slice(index, index + 200).map(toRow);
    const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: "id" });
    if (error) {
      if (missingContactStore(error)) return false;
      throw new Error(error.message);
    }
  }
  return true;
}

export async function deleteContactRecords(ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true;
  if (!(await ensureHubContactsSplit())) return false;
  const supabase = createServiceClient();
  for (let index = 0; index < ids.length; index += 200) {
    const { error } = await supabase
      .from(TABLE)
      .delete()
      .in("id", ids.slice(index, index + 200));
    if (error) {
      if (missingContactStore(error)) return false;
      throw new Error(error.message);
    }
  }
  return true;
}

export async function clearContactUserLinks(
  userId: string,
  exceptId?: string
): Promise<boolean> {
  if (!userId || !(await ensureHubContactsSplit())) return false;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, payload")
    .eq("user_id", userId);
  if (error) {
    if (missingContactStore(error)) return false;
    throw new Error(error.message);
  }
  const now = new Date().toISOString();
  const next: Contact[] = [];
  for (const row of data ?? []) {
    if (row.id === exceptId) continue;
    const contact = asContact(row.payload);
    if (!contact) continue;
    next.push({ ...contact, user_id: null, updated_at: now });
  }
  if (next.length === 0) return true;
  return upsertContactRecords(next);
}

export async function upsertPortalMembers(
  members: Array<{
    portalContactId: string;
    email: string;
    name: string;
    organisation: string;
  }>
): Promise<string[] | null> {
  if (!(await ensureHubContactsSplit())) return null;
  const supabase = createServiceClient();
  const ids: string[] = [];
  const seen = new Set<string>();
  const unique = members.filter((member) => {
    const email = member.email.trim().toLowerCase();
    if (!email || seen.has(email)) return false;
    seen.add(email);
    return true;
  });
  for (let index = 0; index < unique.length; index += 500) {
    const { data, error } = await supabase.rpc("hub_contacts_upsert_members", {
      p_members: unique.slice(index, index + 500),
    });
    if (error) {
      if (missingContactStore(error)) return null;
      throw new Error(error.message);
    }
    if (Array.isArray(data)) ids.push(...data.map(String));
  }
  return ids;
}

export async function revokeStoredConsent(
  keepIds: string[],
  listedIds: string[]
): Promise<number | null> {
  if (!(await ensureHubContactsSplit())) return null;
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("hub_contacts_revoke_consent", {
    p_keep: keepIds,
    p_listed: listedIds,
  });
  if (error) {
    if (missingContactStore(error)) return null;
    throw new Error(error.message);
  }
  return typeof data === "number" ? data : Number(data ?? 0);
}
