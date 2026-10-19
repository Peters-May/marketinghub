/** Lists a recipient can leave from the email preference page. */
export const EMAIL_PREFERENCE_TOPICS = [
  { id: "general_marketing", label: "General" },
  { id: "sailing_schedules", label: "Sailing schedules" },
  { id: "freight_forwarding", label: "Freight forwarding" },
  { id: "commercial_marine", label: "Commercial marine" },
] as const;

export type EmailPreferenceTopic = (typeof EMAIL_PREFERENCE_TOPICS)[number]["id"];

const TOPIC_IDS = new Set<string>(EMAIL_PREFERENCE_TOPICS.map((topic) => topic.id));

export function isEmailPreferenceTopic(value: string): value is EmailPreferenceTopic {
  return TOPIC_IDS.has(value);
}

export function normalizeTopicOptOuts(value: unknown): EmailPreferenceTopic[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<EmailPreferenceTopic>();
  for (const item of value) {
    if (typeof item === "string" && isEmailPreferenceTopic(item)) seen.add(item);
  }
  return EMAIL_PREFERENCE_TOPICS.map((topic) => topic.id).filter((id) => seen.has(id));
}

/** Match a saved audience name to the list it belongs to. */
export function topicForAudienceName(name: string): EmailPreferenceTopic | null {
  const label = name.toLowerCase();
  if (label.includes("sailing")) return "sailing_schedules";
  if (label.includes("freight")) return "freight_forwarding";
  if (label.includes("commercial marine")) return "commercial_marine";
  if (label.includes("marketing") || label.includes("newsletter")) return "general_marketing";
  return null;
}
