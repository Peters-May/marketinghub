import type { AssistantMode } from "@/lib/ai/assistant-shared";
import { isAssistantMode } from "@/lib/ai/assistant-shared";
import type { AssistantReview, AssistantReviewOutcome } from "@/lib/types";

export const ASSISTANT_REVIEW_CAP = 200;

export const ASSISTANT_REVIEW_OUTCOMES = [
  "none",
  "previewed",
  "confirmed",
  "failed",
  "dismissed",
] as const;

export function isAssistantReviewOutcome(
  value: unknown
): value is AssistantReviewOutcome {
  return (
    typeof value === "string" &&
    (ASSISTANT_REVIEW_OUTCOMES as readonly string[]).includes(value)
  );
}

function asString(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.slice(0, max);
}

export function truncateAssistantText(value: string, max = 4000): string {
  const text = value.trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export function normalizeAssistantReview(
  raw: Partial<AssistantReview> | null | undefined
): AssistantReview {
  const mode: AssistantMode = isAssistantMode(raw?.mode) ? raw.mode : "chat";
  const outcome: AssistantReviewOutcome = isAssistantReviewOutcome(raw?.outcome)
    ? raw.outcome
    : "none";
  const rating =
    raw?.rating === "up" || raw?.rating === "down" ? raw.rating : null;
  return {
    id: asString(raw?.id, 80) || "asr_unknown",
    created_at: asString(raw?.created_at, 40) || new Date().toISOString(),
    updated_at: asString(raw?.updated_at, 40) || new Date().toISOString(),
    user_id: asString(raw?.user_id, 120),
    user_name: asString(raw?.user_name, 200),
    mode,
    user_prompt: truncateAssistantText(asString(raw?.user_prompt, 8000), 4000),
    assistant_reply: truncateAssistantText(
      asString(raw?.assistant_reply, 8000),
      4000
    ),
    command_text: truncateAssistantText(
      asString(raw?.command_text, 8000),
      4000
    ),
    outcome,
    error_message: truncateAssistantText(
      asString(raw?.error_message, 2000),
      1000
    ),
    rating,
    note: truncateAssistantText(asString(raw?.note, 1000), 500),
    message_id: asString(raw?.message_id, 80),
  };
}

export function capAssistantReviews(
  rows: AssistantReview[]
): AssistantReview[] {
  if (rows.length <= ASSISTANT_REVIEW_CAP) return rows;
  return [...rows]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    .slice(0, ASSISTANT_REVIEW_CAP);
}
