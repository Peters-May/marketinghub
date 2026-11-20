import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { setPlanAnnotationResolved } from "@/lib/plan/annotations";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to resolve comments." },
      { status: 401 }
    );
  }

  const { id } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.resolved !== "boolean") {
    return NextResponse.json(
      { error: "resolved must be a boolean." },
      { status: 400 }
    );
  }

  const annotation = await setPlanAnnotationResolved({
    id,
    resolved: body.resolved,
  });
  if (!annotation) {
    return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  }

  return NextResponse.json({ annotation });
}
