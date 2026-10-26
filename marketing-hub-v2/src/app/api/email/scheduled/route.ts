import { NextRequest, NextResponse } from "next/server";
import { queueDueCampaignSends } from "@/lib/workflow/queue-campaign-sends";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Vercel Cron calls this every 10 minutes. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await queueDueCampaignSends(1);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scheduled send failed";
    console.error("[email/scheduled]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
