import { NextRequest, NextResponse } from "next/server";
import { dailyAutomationWorkflow } from "@/workflows/daily-automation";
import { start } from "workflow/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Vercel Cron. Reminds people about event preparation and tasks that are due. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const run = await start(dailyAutomationWorkflow);
    console.log("[automation] daily workflow", run.runId);
    return NextResponse.json({ started: true, runId: run.runId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Automation failed";
    console.error("[automation/daily]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
