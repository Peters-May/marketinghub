import { NextRequest, NextResponse } from "next/server";
import { notifyAiKeyExpiry } from "@/lib/ai/ai-key";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Vercel Cron calls this once a day. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await notifyAiKeyExpiry();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI key reminder failed";
    console.error("[admin/ai-key/notify]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
