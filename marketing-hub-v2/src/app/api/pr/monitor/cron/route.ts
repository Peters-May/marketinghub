import { NextRequest, NextResponse } from "next/server";
import { sendMonitorDigest } from "@/lib/pr/monitor-digest";
import { runActiveMonitorQueries } from "@/lib/pr/monitor-run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Vercel Cron — run active monitoring queries and email a digest when new. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const run = await runActiveMonitorQueries();
    const digest = await sendMonitorDigest({ mentions: run.created });
    return NextResponse.json({
      added: run.added,
      queries: run.results.map((r) => ({
        id: r.query_id,
        name: r.query_name,
        added: r.added,
        error: r.error ?? null,
      })),
      news_api_configured: run.news_api_configured,
      digest_sent: digest.sent,
      digest_recipients: digest.recipients,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Monitoring cron failed";
    console.error("[pr/monitor/cron]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
