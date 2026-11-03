import { NextRequest } from "next/server";
import {
  isAssistantReviewOutcome,
} from "@/lib/ai/assistant-reviews";
import { isAssistantMode } from "@/lib/ai/assistant-shared";
import { jsonError, jsonOk, requireAdmin, requireStaff } from "@/lib/api";
import {
  createAssistantReview,
  getAssistantReview,
  listAssistantReviews,
  updateAssistantReview,
} from "@/lib/data/repos";
import type { AssistantReviewOutcome } from "@/lib/types";

export const dynamic = "force-dynamic";

function asTrimmed(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function GET() {
  const { user, error } = await requireAdmin();
  if (error || !user) return error;

  const reviews = await listAssistantReviews();
  return jsonOk({ reviews });
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireStaff();
  if (error || !user) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body", 400);
  }

  const id = asTrimmed(body.id, 80);
  const rating =
    body.rating === "up" || body.rating === "down" ? body.rating : null;
  const note = asTrimmed(body.note, 500);
  const outcome: AssistantReviewOutcome | undefined = isAssistantReviewOutcome(
    body.outcome
  )
    ? body.outcome
    : undefined;

  if (id) {
    const existing = await getAssistantReview(id);
    if (!existing) return jsonError("Review not found", 404);
    if (user.role !== "admin" && existing.user_id !== user.id) {
      return jsonError("You can only update your own assistant reviews.", 403);
    }

    const patch: Parameters<typeof updateAssistantReview>[1] = {};
    if (outcome) patch.outcome = outcome;
    if (typeof body.command_text === "string") {
      patch.command_text = asTrimmed(body.command_text, 4000);
    }
    if (typeof body.assistant_reply === "string") {
      patch.assistant_reply = asTrimmed(body.assistant_reply, 4000);
    }
    if (typeof body.error_message === "string") {
      patch.error_message = asTrimmed(body.error_message, 1000);
    }
    if (body.rating === "up" || body.rating === "down" || body.rating === null) {
      patch.rating = body.rating === null ? null : body.rating;
    }
    if (typeof body.note === "string") patch.note = note;
    if (typeof body.message_id === "string") {
      patch.message_id = asTrimmed(body.message_id, 80);
    }

    const updated = await updateAssistantReview(id, patch);
    if (!updated) return jsonError("Review not found", 404);
    return jsonOk({ review: updated });
  }

  const mode = isAssistantMode(body.mode) ? body.mode : "chat";
  const review = await createAssistantReview({
    user_id: user.id,
    user_name: user.full_name || user.email || "Staff",
    mode,
    user_prompt: asTrimmed(body.user_prompt, 4000),
    assistant_reply: asTrimmed(body.assistant_reply, 4000),
    command_text: asTrimmed(body.command_text, 4000),
    outcome: outcome ?? "none",
    error_message: asTrimmed(body.error_message, 1000),
    rating,
    note,
    message_id: asTrimmed(body.message_id, 80),
  });

  return jsonOk({ review });
}
