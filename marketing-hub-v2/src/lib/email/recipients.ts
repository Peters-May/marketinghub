import type {
  Contact,
  EmailAudience,
  EmailAudienceFilter,
  MediaList,
} from "@/lib/types";
import {
  normalizeTopicOptOuts,
  topicForAudienceName,
  type EmailPreferenceTopic,
} from "@/lib/email/preferences";
import {
  allowsRecipient,
  type RecipientPurpose,
} from "@/lib/email/recipient-rules";
import { isPressContact } from "@/lib/pr/pitch-eml";

export type { RecipientPurpose };
export { allowsRecipient, emptyRecipientError } from "@/lib/email/recipient-rules";

export type RecipientQuery = {
  audienceId?: string | null;
  excludeAudienceId?: string | null;
  listIds?: string[];
  recipientIds?: string[];
  excludeUnsubscribed?: boolean;
  /** Marketing requires opt-in. Pitch uses press and mixed lists. */
  purpose?: RecipientPurpose;
};

type RecipientStore = {
  contacts?: Contact[];
  media_lists?: MediaList[];
  email_audiences?: EmailAudience[];
  email_suppressions?: { email: string; reason?: string }[];
};

type RecipientIndex = {
  contactsById: Map<string, Contact>;
  listsById: Map<string, string[]>;
  pressListIds: Set<string>;
  audiencesById: Map<string, EmailAudience>;
  /** Every suppressed address, including unsubscribes. */
  suppressions: Set<string>;
  /** Bounces and complaints. Never mailed, whatever the audience settings. */
  hardSuppressions: Set<string>;
};

function audienceFilter(
  filter?: Partial<EmailAudienceFilter> | null
): EmailAudienceFilter {
  return {
    tags: Array.isArray(filter?.tags)
      ? filter.tags.map((tag) => String(tag).trim().toLowerCase())
      : [],
    country: (filter?.country ?? "").trim().toLowerCase(),
  };
}

export function buildRecipientIndex(store: RecipientStore): RecipientIndex {
  const contactsById = new Map<string, Contact>();
  for (const contact of store.contacts ?? []) contactsById.set(contact.id, contact);

  const listsById = new Map<string, string[]>();
  const pressListIds = new Set<string>();
  for (const list of store.media_lists ?? []) {
    listsById.set(list.id, list.contact_ids ?? []);
    if (list.list_kind === "press" || list.list_kind === "mixed") {
      pressListIds.add(list.id);
    }
  }

  const audiencesById = new Map<string, EmailAudience>();
  for (const audience of store.email_audiences ?? []) {
    audiencesById.set(audience.id, audience);
  }

  const suppressions = new Set<string>();
  const hardSuppressions = new Set<string>();
  for (const row of store.email_suppressions ?? []) {
    const email = row.email.trim().toLowerCase();
    if (!email) continue;
    suppressions.add(email);
    if (row.reason === "bounce" || row.reason === "complaint") hardSuppressions.add(email);
  }

  return {
    contactsById,
    listsById,
    pressListIds,
    audiencesById,
    suppressions,
    hardSuppressions,
  };
}

function addListMembers(
  index: RecipientIndex,
  ids: Set<string>,
  listIds: string[] | undefined,
  pressContactIds?: Set<string>
) {
  for (const listId of listIds ?? []) {
    const members = index.listsById.get(listId);
    if (!members) continue;
    const pressList = index.pressListIds.has(listId);
    for (const id of members) {
      ids.add(id);
      if (pressList) pressContactIds?.add(id);
    }
  }
}

function optedOut(contact: Contact, topic: EmailPreferenceTopic | null) {
  if (!topic) return false;
  const raw = contact.email_topic_opt_outs;
  if (!Array.isArray(raw) || raw.length === 0) return false;
  return normalizeTopicOptOuts(raw).includes(topic);
}

function eligible(
  contact: Contact,
  index: RecipientIndex,
  excludeEmails: Set<string>,
  excludeUnsubscribed: boolean,
  topic: EmailPreferenceTopic | null,
  filter: EmailAudienceFilter,
  purpose: RecipientPurpose,
  onPressOrMixedList: boolean
) {
  const email = (contact.email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return false;
  if (
    !allowsRecipient({
      purpose,
      marketingConsent: contact.marketing_consent,
      onPressOrMixedList,
      isPress: isPressContact(contact),
    })
  ) {
    return false;
  }
  if (index.hardSuppressions.has(email)) return false;
  if (excludeUnsubscribed && index.suppressions.has(email)) return false;
  if (excludeEmails.has(email)) return false;
  if (optedOut(contact, topic)) return false;
  if (filter.country && (contact.country ?? "").trim().toLowerCase() !== filter.country) {
    return false;
  }
  if (filter.tags.length) {
    const tags = new Set((contact.tags ?? []).map((tag) => tag.toLowerCase()));
    if (!filter.tags.every((tag) => tags.has(tag))) return false;
  }
  return true;
}

function queryPlan(index: RecipientIndex, opts: RecipientQuery) {
  const ids = new Set<string>();
  const pressContactIds = new Set<string>();
  for (const id of opts.recipientIds ?? []) ids.add(id);

  let excludeUnsubscribed = opts.excludeUnsubscribed !== false;
  let filter = audienceFilter();
  let topic: EmailPreferenceTopic | null = null;

  if (opts.audienceId) {
    const audience = index.audiencesById.get(opts.audienceId);
    if (audience) {
      excludeUnsubscribed = audience.exclude_unsubscribed !== false;
      filter = audienceFilter(audience.filter);
      topic = topicForAudienceName(audience.name);
      for (const id of audience.contact_ids ?? []) ids.add(id);
      addListMembers(index, ids, audience.list_ids, pressContactIds);
    }
  }

  addListMembers(index, ids, opts.listIds, pressContactIds);

  const excludeEmails = new Set<string>();
  if (opts.excludeAudienceId) {
    const excluded = index.audiencesById.get(opts.excludeAudienceId);
    if (excluded) {
      const excludeIds = new Set<string>(excluded.contact_ids ?? []);
      addListMembers(index, excludeIds, excluded.list_ids);
      for (const id of excludeIds) {
        const email = (index.contactsById.get(id)?.email ?? "").trim().toLowerCase();
        if (email) excludeEmails.add(email);
      }
    }
  }

  return {
    ids,
    excludeUnsubscribed,
    filter,
    topic,
    excludeEmails,
    pressContactIds,
    purpose: opts.purpose ?? "marketing",
  };
}

/** Recipients for a marketing send or a press pitch. */
export function matchEmailRecipients(
  index: RecipientIndex,
  opts: RecipientQuery
): Contact[] {
  const plan = queryPlan(index, opts);
  const out: Contact[] = [];
  for (const id of plan.ids) {
    const contact = index.contactsById.get(id);
    if (!contact) continue;
    if (
      eligible(
        contact,
        index,
        plan.excludeEmails,
        plan.excludeUnsubscribed,
        plan.topic,
        plan.filter,
        plan.purpose,
        plan.pressContactIds.has(id)
      )
    ) {
      out.push(contact);
    }
  }
  return out;
}

export function countEmailRecipients(
  index: RecipientIndex,
  opts: RecipientQuery
): number {
  const plan = queryPlan(index, opts);
  let count = 0;
  for (const id of plan.ids) {
    const contact = index.contactsById.get(id);
    if (!contact) continue;
    if (
      eligible(
        contact,
        index,
        plan.excludeEmails,
        plan.excludeUnsubscribed,
        plan.topic,
        plan.filter,
        plan.purpose,
        plan.pressContactIds.has(id)
      )
    ) {
      count += 1;
    }
  }
  return count;
}
