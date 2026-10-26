/** Wait for a workflow the API has already started. */
export async function pollWorkflow<T>(path: string, runId: string): Promise<T> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const res = await fetch(`${path}?runId=${encodeURIComponent(runId)}`);
    const data = (await res.json()) as {
      status?: string;
      result?: T;
      error?: string;
    };
    if (!res.ok) throw new Error(data.error || "Could not check the job");
    if (data.status === "completed" && data.result) return data.result;
    if (data.status === "failed" || data.status === "cancelled") {
      throw new Error(data.error || "The job did not finish");
    }
  }
  throw new Error("This is still running. Refresh the page in a minute to see the result.");
}
