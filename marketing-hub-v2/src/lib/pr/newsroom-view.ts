import type { Contact, ContentItem } from "@/lib/types";
import { plainTextFromHtml } from "@/lib/plain-text";
import { isPressContact } from "@/lib/pr/pitch-eml";

/** Media desk address, matching MEDIA_DESK_HTML in the brand factsheet. */
export const MEDIA_DESK_EMAIL = "marketing@petersandmay.com";

export const BRAND_GUIDELINES_PDF = "/brand-guidelines-2026.pdf";

export const NEWSROOM_SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "";

/** Categories that say nothing useful as a public topic. */
const HIDDEN_TOPICS = new Set(["general", "press release", "news", "marketing"]);

export function releaseDateIso(item: ContentItem): string {
  return (item.due_date || item.updated_at || "").slice(0, 10);
}

/** "3 Nov 2026" for lists and sidebars. */
export function shortReleaseDate(iso: string | null | undefined): string {
  const day = (iso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "";
  const date = new Date(`${day}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

/** Public topics for a release: its tags, then its category if meaningful. */
export function releaseTopics(item: ContentItem): string[] {
  const tags = item.pr_document?.tags ?? [];
  const topics = [...tags];
  const category = item.category?.trim();
  if (category && !HIDDEN_TOPICS.has(category.toLowerCase())) {
    topics.push(category);
  }
  const seen = new Set<string>();
  return topics
    .map((t) => t.trim())
    .filter((t) => {
      const key = t.toLowerCase();
      if (!t || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function topicSlug(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Topics across all releases, most used first. */
export function topicIndex(items: ContentItem[]): { topic: string; slug: string; count: number }[] {
  const counts = new Map<string, { topic: string; count: number }>();
  for (const item of items) {
    for (const topic of releaseTopics(item)) {
      const slug = topicSlug(topic);
      const entry = counts.get(slug);
      if (entry) entry.count += 1;
      else counts.set(slug, { topic, count: 1 });
    }
  }
  return [...counts.entries()]
    .map(([slug, v]) => ({ slug, ...v }))
    .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic));
}

export function releaseSummary(item: ContentItem, max = 200): string {
  const text = plainTextFromHtml(item.caption || "").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 120 ? lastSpace : max).trimEnd()}…`;
}

/**
 * Public newsroom press contacts. Always shown in this order.
 * Contact records enrich phone/photo when present; roster supplies the rest.
 */
const NEWSROOM_SPOKESPERSON_ROSTER: Array<{
  email: string;
  name: string;
  role: string;
  organisation: string;
  photo_url: string;
}> = [
  {
    email: "simon@petersandmay.com",
    name: "Simon Judson",
    role: "Chief Executive Officer",
    organisation: "Peters & May",
    photo_url: "/newsroom/spokespeople/simon-judson.jpg",
  },
  {
    email: "craig@petersandmay.com",
    name: "Craig Stanbury",
    role: "Global Operations Director - Racing",
    organisation: "Peters & May",
    photo_url: "/newsroom/spokespeople/craig-stanbury.jpg",
  },
  {
    email: "richard@petersandmay.com",
    name: "Richard Howatt",
    role: "UK Marine Senior Sales Manager",
    organisation: "Peters & May",
    photo_url: "/newsroom/spokespeople/richard-howatt.jpg",
  },
  {
    email: "peverley@petersandmay.com",
    name: "Paul Everley",
    role: "Global Head of Forwarding",
    organisation: "Peters & May",
    photo_url: "/newsroom/spokespeople/paul-everley.jpg",
  },
  {
    email: "robert@petersandmay.com",
    name: "Robert Blades",
    role: "Global Commercial Sales Manager",
    organisation: "Peters & May",
    photo_url: "/newsroom/spokespeople/robert-blades.jpg",
  },
  {
    email: "marketing@petersandmay.com",
    name: "Sophie Edgerley",
    role: "Marketing Manager",
    organisation: "Peters & May",
    photo_url: "/newsroom/spokespeople/sophie-edgerley.jpg",
  },
];

export function newsroomSpokespeople(contacts: Contact[]): Contact[] {
  const byEmail = new Map<string, Contact>();
  for (const contact of contacts) {
    const email = contact.email.trim().toLowerCase();
    if (!email || isPressContact(contact)) continue;
    byEmail.set(email, contact);
  }

  return NEWSROOM_SPOKESPERSON_ROSTER.map((person, index) => {
    const match = byEmail.get(person.email);
    return {
      id: match?.id ?? `newsroom-spokesperson-${index}`,
      kind: "person" as const,
      name: person.name,
      organisation: person.organisation,
      role: person.role,
      email: person.email,
      phone: match?.phone ?? "",
      website: "",
      services: "",
      tags: [],
      notes: "",
      user_id: match?.user_id ?? null,
      is_press: false,
      is_spokesperson: true,
      photo_url: match?.photo_url?.trim() || person.photo_url,
      beat: "",
      outlet: "",
      country: "",
      preferred_topics: "",
      last_contacted_at: null,
      marketing_consent: null,
      portal_contact_id: match?.portal_contact_id ?? null,
      created_at: match?.created_at ?? "",
      updated_at: match?.updated_at ?? "",
    };
  });
}

export function releaseUrl(id: string): string {
  return `${NEWSROOM_SITE_URL}/newsroom/${id}`;
}
