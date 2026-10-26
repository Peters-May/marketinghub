import type { ResendEventJob } from "@/lib/email/apply-resend-event";

export async function resendEventWorkflow(job: ResendEventJob) {
  "use workflow";
  console.log("[workflow] resend event", job.kind, job.campaignId);
  const result = await recordResendEvent(job);
  console.log("[workflow] resend event recorded", job.messageId);
  return result;
}

async function recordResendEvent(job: ResendEventJob) {
  "use step";
  console.log("[workflow] record resend event", job.kind, job.messageId);
  const { applyResendEvent } = await import("@/lib/email/apply-resend-event");
  return applyResendEvent(job);
}
