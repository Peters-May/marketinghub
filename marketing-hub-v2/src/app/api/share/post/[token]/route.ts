import { NextResponse } from "next/server";
import { getPublicPostByShareToken } from "@/lib/data/repos";
import { rateLimitPublic } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

type Ctx = { params: { token: string } };

export async function GET(request: Request, context: Ctx) {
  const limited = rateLimitPublic(request, "post-share", 60);
  if (!limited.ok) return limited.response;

  const token = context.params.token;
  try {
    const preview = await getPublicPostByShareToken(token || "");
    if (!preview) {
      return NextResponse.json(
        { error: "This share link is invalid or has been turned off." },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json(
      { preview },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Failed to load shared post",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
