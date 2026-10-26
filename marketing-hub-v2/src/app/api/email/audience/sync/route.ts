import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireAdmin } from "@/lib/api";
import type { PortalAudienceSyncResult } from "@/lib/sync/portal-marketing";
import { readWorkflowResult } from "@/lib/workflow/run-status";
import { portalAudienceWorkflow } from "@/workflows/portal-audience";
import { start } from "workflow/api";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;
  const runId = request.nextUrl.searchParams.get("runId");
  if (!runId) return jsonError("runId required", 400);
  return jsonOk(await readWorkflowResult<PortalAudienceSyncResult>(runId));
}

/** Pull Portal lists marked for the hub, then the opted-in Portal audience. */
export async function POST() {
  const { error } = await requireAdmin();
  if (error) return error;
  const run = await start(portalAudienceWorkflow);
  console.log("[portal] audience workflow", run.runId);
  return jsonOk({ runId: run.runId, status: "running" });
}
