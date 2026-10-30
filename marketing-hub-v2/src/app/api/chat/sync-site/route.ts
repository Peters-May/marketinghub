import { NextRequest, NextResponse } from "next/server";
import { requireEnquiriesAccess } from "@/lib/api";
import type { SiteKnowledgeSyncResult } from "@/lib/chat/sync-site-knowledge";
import { readWorkflowResult } from "@/lib/workflow/run-status";
import { siteKnowledgeSyncWorkflow } from "@/workflows/site-knowledge";
import { start } from "workflow/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Cron starts the monthly copy. Staff poll a run with ?runId=. */
export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get("runId");
  if (runId) {
    const gate = await requireEnquiriesAccess();
    if (gate.error) return gate.error;
    const status = await readWorkflowResult<SiteKnowledgeSyncResult>(runId);
    return NextResponse.json(status);
  }

  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const run = await start(siteKnowledgeSyncWorkflow);
    console.log("[chat] site knowledge sync", run.runId);
    return NextResponse.json({ started: true, runId: run.runId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    console.error("[chat/sync-site]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Staff: copy the public website into the chat knowledge base now. */
export async function POST() {
  const gate = await requireEnquiriesAccess();
  if (gate.error) return gate.error;
  try {
    const run = await start(siteKnowledgeSyncWorkflow);
    console.log("[chat] site knowledge sync (staff)", run.runId);
    return NextResponse.json({ started: true, runId: run.runId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    console.error("[chat/sync-site]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
