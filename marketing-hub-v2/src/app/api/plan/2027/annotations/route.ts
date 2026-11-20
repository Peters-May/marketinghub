import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import {
  createPlanAnnotation,
  listPlanAnnotations,
} from "@/lib/plan/annotations";

export const dynamic = "force-dynamic";

export async function GET() {
  const [annotations, user] = await Promise.all([
    listPlanAnnotations("2027"),
    getSessionUser(),
  ]);
  return NextResponse.json({
    annotations,
    viewer: user
      ? {
          name: user.full_name,
          user_id: user.id,
          role: user.role,
        }
      : null,
  });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const authorName = user
    ? user.full_name
    : String(body.author_name ?? "").trim();
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
    author_user_id: user?.id ?? "",
  });

  if (!annotation) {
    return NextResponse.json(
      { error: "Could not save comment." },
      { status: 400 }
    );
  }

  return NextResponse.json({ annotation }, { status: 201 });
}
