import type { Contact } from "@/lib/types";

const TTL_MS = 30_000;

type Cache = { at: number; contacts: Contact[] };

let cache: Cache | null = null;
let inflight: Promise<Contact[]> | null = null;

/** Keep a contact created in this tab visible to the next shared load. */
export function upsertCachedContact(item: Contact) {
  if (!cache) {
    cache = { at: Date.now(), contacts: [item] };
    return;
  }
  const exists = cache.contacts.some((contact) => contact.id === item.id);
  cache = {
    at: cache.at,
    contacts: exists
      ? cache.contacts.map((contact) =>
          contact.id === item.id ? item : contact
        )
      : [...cache.contacts, item],
  };
}

/**
 * One contact-list request per tab. Owner fields on a long list used to each
 * call /api/contacts, and every call reads the full hub document.
 */
export function loadContactList(): Promise<Contact[]> {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return Promise.resolve(cache.contacts);
  }
  if (inflight) return inflight;
  const run = fetch("/api/contacts")
    .then(async (res) => {
      if (!res.ok) throw new Error("Could not load contacts");
      const data = (await res.json()) as { contacts?: Contact[] };
      const contacts = data.contacts ?? [];
      cache = { at: Date.now(), contacts };
      return contacts;
    })
    .finally(() => {
      if (inflight === run) inflight = null;
    });
  inflight = run;
  return run;
}
