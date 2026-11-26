import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api";
import {
  createPlanAnnotation,
  listPlanAnnotations,
} from "@/lib/plan/annotations";
import { rateLimitPublic } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = rateLimitPublic(req, "plan-annotations-get", 60);
  if (!limited.ok) return limited.response;

  const { user, error } = await requireStaff();
  if (error) return error;

  const annotations = await listPlanAnnotations("2027");
  return NextResponse.json({
    annotations,
    viewer: {
      name: user.full_name,
      user_id: user.id,
      role: user.role,
    },
  });
}

export async function POST(req: NextRequest) {
  const limited = rateLimitPublic(req, "plan-annotations-post", 30);
  if (!limited.ok) return limited.response;

  const { user, error } = await requireStaff();
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const authorName = user.full_name?.trim();
  if (!authorName) {
    return NextResponse.json(
      { error: "Your name is required to comment." },
      { status: 400 }
    );
  }

  const quote = String(body.quote ?? "").trim();
  const commentBody = String(body.body ?? "").trim();
  if (!quote || !commentBody) {
    return NextResponse.json(
      { error: "Selected text and comment are required." },
      { status: 400 }
    );
  }

  const annotation = await createPlanAnnotation({
    plan_id: "2027",
    quote,
    prefix: String(body.prefix ?? ""),
    suffix: String(body.suffix ?? ""),
    section_id: String(body.section_id ?? ""),
    body: commentBody,
    author_name: authorName,
    author_user_id: user.id,
  });

  if (!annotation) {
    return NextResponse.json(
      { error: "Could not save comment." },
      { status: 400 }
    );
  }

  return NextResponse.json({ annotation }, { status: 201 });
}
