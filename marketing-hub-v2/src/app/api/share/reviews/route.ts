import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireStaff } from "@/lib/api";
import {
  applyShareReview,
  listShareReviewsForTarget,
} from "@/lib/data/repos";
import type { ShareReviewTargetType } from "@/lib/types";

export const dynamic = "force-dynamic";

function parseTargetType(raw: string): ShareReviewTargetType | null {
  if (
    raw === "content" ||
    raw === "email_campaign" ||
    raw === "email_template"
  ) {
    return raw;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const { error } = await requireStaff();
  if (error) return error;

  const target_type = parseTargetType(
    request.nextUrl.searchParams.get("target_type") || ""
  );
  const target_id = (request.nextUrl.searchParams.get("target_id") || "").trim();
  if (!target_type || !target_id) {
    return jsonError("target_type and target_id required", 400);
  }

  const reviews = await listShareReviewsForTarget(target_type, target_id);
  return jsonOk({ reviews });
}

export async function POST(request: NextRequest) {
  const { error } = await requireStaff();
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  if (body.action !== "apply") {
    return jsonError("Unknown action", 400);
  }

  const reviewId = String(body.review_id ?? "").trim();
  if (!reviewId) return jsonError("review_id required", 400);

  const result = await applyShareReview(reviewId, {
    applyCopy: body.apply_copy !== false,
    applyImages: body.apply_images === true,
  });
  if (!result) return jsonError("Review not found", 404);
  return jsonOk(result);
}
