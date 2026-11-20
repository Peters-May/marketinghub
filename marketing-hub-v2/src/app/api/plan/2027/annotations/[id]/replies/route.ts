import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { replyToPlanAnnotation } from "@/lib/plan/annotations";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  const { id } = await context.params;
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
      { error: "Your name is required to reply." },
      { status: 400 }
    );
  }

  const replyBody = String(body.body ?? "").trim();
  if (!replyBody) {
    return NextResponse.json(
      { error: "Reply text is required." },
      { status: 400 }
    );
  }

  const annotation = await replyToPlanAnnotation({
    id,
    body: replyBody,
    author_name: authorName,
    author_user_id: user?.id ?? "",
  });

  if (!annotation) {
    return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  }

  return NextResponse.json({ annotation }, { status: 201 });
}
