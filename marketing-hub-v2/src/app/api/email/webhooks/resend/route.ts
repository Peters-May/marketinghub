import { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { jsonError, jsonOk } from "@/lib/api";
import type { ResendEventJob } from "@/lib/email/apply-resend-event";
import { readResendEventDetail } from "@/lib/email/resend-event";
import type { EmailEventKind } from "@/lib/types";
import { resendEventWorkflow } from "@/workflows/resend-event";
import { start } from "workflow/api";

export const maxDuration = 30;

/**
 * Resend webhook. The request is acknowledged immediately.
 * Opens, clicks and deliveries are stored by a workflow step.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();

  // Without a secret anyone could post fake bounces and complaints, which
  // suppress contacts and push opt-outs to the Portal. Fail closed.
  if (!secret) {
    console.error("[resend-webhook] RESEND_WEBHOOK_SECRET is not set; rejecting event");
    return jsonError("Webhook not configured", 503);
  }
  if (!verifyResendSignature(request, rawBody, secret)) {
    return jsonError("Invalid signature", 401);
  }

  let payload: {
    type?: string;
    data?: Record<string, unknown>;
  };
  try {
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const type = String(payload.type ?? "");
  const data = payload.data ?? {};
  const kind = mapResendType(type);
  if (!kind) return jsonOk({ ok: true, ignored: type });

  const detail = readResendEventDetail(data);
  const campaignId = detail.campaignId;
  if (!campaignId) return jsonOk({ ok: true, skipped: "no campaign_id" });

  const job: ResendEventJob = {
    type,
    kind,
    email: extractEmail(data),
    messageId: String(data.email_id ?? data.id ?? data.message_id ?? ""),
    campaignId,
    link: detail.link,
    userAgent: detail.userAgent,
    occurredAt: detail.occurredAt,
  };
  const run = await start(resendEventWorkflow, [job]);
  console.log("[email] resend workflow", kind, run.runId);
  return jsonOk({ ok: true, runId: run.runId });
}

function mapResendType(type: string): EmailEventKind | null {
  switch (type) {
    case "email.sent":
      return "sent";
    case "email.delivered":
      return "delivered";
    case "email.opened":
      return "opened";
    case "email.clicked":
      return "clicked";
    case "email.bounced":
      return "bounced";
    case "email.complained":
      return "complained";
    default:
      return null;
  }
}

function extractEmail(data: Record<string, unknown>): string {
  const to = data.to;
  if (typeof to === "string") return to.trim().toLowerCase();
  if (Array.isArray(to) && typeof to[0] === "string") {
    return to[0].trim().toLowerCase();
  }
  if (typeof data.email === "string") return data.email.trim().toLowerCase();
  return "";
}

/** Svix-compatible webhook verify (Resend uses Svix). */
function verifyResendSignature(
  request: NextRequest,
  body: string,
  secret: string
): boolean {
  const msgId = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signatureHeader = request.headers.get("svix-signature");
  if (!msgId || !timestamp || !signatureHeader) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 60 * 5) return false;

  const signedContent = `${msgId}.${timestamp}.${body}`;
  const secretBytes = secret.startsWith("whsec_")
    ? Buffer.from(secret.slice(6), "base64")
    : Buffer.from(secret, "utf8");
  const expected = createHmac("sha256", secretBytes)
    .update(signedContent)
    .digest("base64");

  const parts = signatureHeader.split(" ");
  for (const part of parts) {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) continue;
    try {
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    } catch {
      /* continue */
    }
  }
  return false;
}
