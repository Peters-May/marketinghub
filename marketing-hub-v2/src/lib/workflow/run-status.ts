import { getRun } from "workflow/api";

export async function readWorkflowResult<T>(runId: string) {
  const run = getRun<T>(runId);
  const status = await run.status;
  if (status === "completed") {
    return { status, result: await run.returnValue };
  }
  if (status === "failed" || status === "cancelled") {
    return { status, error: "The job did not finish." };
  }
  return { status };
}
