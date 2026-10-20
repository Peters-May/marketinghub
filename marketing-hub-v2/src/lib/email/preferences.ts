/** Lists a recipient can leave from the email preference page. */
export const EMAIL_PREFERENCE_TOPICS = [
  { id: "general_marketing", label: "General" },
  { id: "sailing_schedules", label: "Sailing schedules" },
  { id: "freight_forwarding", label: "Freight forwarding" },
  { id: "commercial_marine", label: "Commercial marine" },
] as const;

export type EmailPreferenceTopic = (typeof EMAIL_PREFERENCE_TOPICS)[number]["id"];

/** Why someone stopped marketing email — stored for campaign reporting. */
export const UNSUBSCRIBE_FEEDBACK_REASONS = [
  { id: "too_frequent", label: "Too many emails" },
  { id: "not_relevant", label: "Content is not relevant" },
  { id: "never_signed_up", label: "I never signed up" },
  { id: "moved_on", label: "No longer need these updates" },
  { id: "other", label: "Other" },
] as const;

export type UnsubscribeFeedbackReason =
  (typeof UNSUBSCRIBE_FEEDBACK_REASONS)[number]["id"];

const TOPIC_IDS = new Set<string>(EMAIL_PREFERENCE_TOPICS.map((topic) => topic.id));
const FEEDBACK_IDS = new Set<string>(
  UNSUBSCRIBE_FEEDBACK_REASONS.map((reason) => reason.id)
);

export function isEmailPreferenceTopic(value: string): value is EmailPreferenceTopic {
  return TOPIC_IDS.has(value);
}

export function isUnsubscribeFeedbackReason(
  value: string
): value is UnsubscribeFeedbackReason {
  return FEEDBACK_IDS.has(value);
}

export function normalizeTopicOptOuts(value: unknown): EmailPreferenceTopic[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<EmailPreferenceTopic>();
  for (const item of value) {
    if (typeof item === "string" && isEmailPreferenceTopic(item)) seen.add(item);
  }
  return EMAIL_PREFERENCE_TOPICS.map((topic) => topic.id).filter((id) => seen.has(id));
}

/**
 * Turn a preference-page choice into a short note for suppressions and events.
 * Returns empty when nothing was chosen (re-subscribe / no opt-out).
 */
export function formatUnsubscribeFeedback(input: {
  reason?: unknown;
  other?: unknown;
}): string {
  const reasonId =
    typeof input.reason === "string" && isUnsubscribeFeedbackReason(input.reason)
      ? input.reason
      : null;
  if (!reasonId) return "";
  const label =
    UNSUBSCRIBE_FEEDBACK_REASONS.find((item) => item.id === reasonId)?.label ??
    reasonId;
  if (reasonId !== "other") return label;
  const other = typeof input.other === "string" ? input.other.trim() : "";
  return other ? `Other: ${other.slice(0, 280)}` : "Other";
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
