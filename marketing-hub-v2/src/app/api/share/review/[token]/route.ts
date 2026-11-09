import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/api";
import {
  appendShareReview,
  resolveShareTargetByToken,
} from "@/lib/data/repos";
import { notifyShareReviewAlert } from "@/lib/email/send-share-review-alert";
import { rateLimitPublic } from "@/lib/security/rate-limit";
import type { ShareReviewDecision } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: { token: string } };

export async function GET(request: NextRequest, context: Ctx) {
  const limited = rateLimitPublic(request, "share-review-get", 60);
  if (!limited.ok) return limited.response;

  const token = context.params.token || "";
  try {
    const target = await resolveShareTargetByToken(token);
    if (!target) {
      return jsonError("This share link is invalid or has been turned off.", 404);
    }
    return jsonOk({
      audience: target.audience,
      target_type: target.target_type,
      title: target.title,
      caption: target.caption,
      subject: target.subject,
    });
  } catch (e) {
    return jsonError(
      e instanceof Error ? e.message : "Failed to load share target",
      500
    );
  }
}

export async function POST(request: NextRequest, context: Ctx) {
  const limited = rateLimitPublic(request, "share-review-post", 20);
  if (!limited.ok) return limited.response;

  const token = context.params.token || "";
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const decisionRaw = String(body.decision ?? "");
  const decision: ShareReviewDecision | null =
    decisionRaw === "approved" || decisionRaw === "changes_requested"
      ? decisionRaw
      : null;
  if (!decision) {
    return jsonError("decision must be approved or changes_requested", 400);
  }

  const approved_by_name = String(body.approved_by_name ?? "").trim();
  if (!approved_by_name || approved_by_name.length > 120) {
    return jsonError("Approved by name is required", 400);
  }

  try {
    const review = await appendShareReview({
      token,
      decision,
      amended_caption:
        body.amended_caption !== undefined
          ? String(body.amended_caption)
          : undefined,
      amended_subject:
        body.amended_subject !== undefined
          ? String(body.amended_subject)
          : undefined,
      notes: String(body.notes ?? ""),
      tagged_people: Array.isArray(body.tagged_people)
        ? (body.tagged_people as { name: string; email?: string }[])
        : [],
      added_image_urls: Array.isArray(body.added_image_urls)
        ? (body.added_image_urls as string[])
        : [],
      approved_by_name,
      approved_by_email: String(body.approved_by_email ?? ""),
      approved_by_role: String(body.approved_by_role ?? ""),
    });
    if (!review) {
      return jsonError("This share link is invalid or has been turned off.", 404);
    }

    const target = await resolveShareTargetByToken(token);
    notifyShareReviewAlert({
      review,
      title: target?.title || "Untitled",
      hubPath: target?.hubPath || "/app",
    });

    return jsonOk({ review });
  } catch (e) {
    return jsonError(
      e instanceof Error ? e.message : "Failed to submit review",
      500
    );
  }
}
