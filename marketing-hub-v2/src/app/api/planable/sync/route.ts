import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireStaff } from "@/lib/api";
import { getPlanableConfig } from "@/lib/planable/client";
import type { PlanableSyncResult } from "@/lib/planable/sync";
import { readWorkflowResult } from "@/lib/workflow/run-status";
import { planableSyncWorkflow } from "@/workflows/planable-sync";
import { start } from "workflow/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Sync status / config (staff), or a running workflow (admin). */
export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get("runId");
  if (runId) {
    const { error } = await requireAdmin();
    if (error) return error;
    const status = await readWorkflowResult<PlanableSyncResult>(runId);
    return NextResponse.json(status);
  }

  const { error } = await requireStaff();
  if (error) return error;
  const config = getPlanableConfig();
  return NextResponse.json({
    configured: config.configured,
    workspaceId: config.workspaceId ?? null,
    openUrl: config.openUrl,
  });
}

/** Pull Planable posts into Hub social content (admin). */
export async function POST() {
  const { error } = await requireAdmin();
  if (error) return error;
  const run = await start(planableSyncWorkflow);
  console.log("[planable] sync workflow", run.runId);
  return NextResponse.json({ runId: run.runId, status: "running" });
}
