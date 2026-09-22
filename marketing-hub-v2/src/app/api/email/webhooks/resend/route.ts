import { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { jsonError, jsonOk } from "@/lib/api";
import {
  addEmailSuppression,
  appendEmailEvent,
  bumpEmailCampaignStat,
  listContacts,
  updateContact,
} from "@/lib/data/repos";
import type { EmailEventKind } from "@/lib/types";

/**
 * Resend webhook → email_events + campaign stats.
 * Verifies svix-style signatures when RESEND_WEBHOOK_SECRET is set.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();

  if (secret) {
    const valid = verifyResendSignature(request, rawBody, secret);
    if (!valid) return jsonError("Invalid signature", 401);
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

  const email = extractEmail(data);
  const messageId = String(
    data.email_id ?? data.id ?? data.message_id ?? ""
  );
  const campaignId = extractCampaignId(data);
  if (!campaignId) return jsonOk({ ok: true, skipped: "no campaign_id" });

  await appendEmailEvent({
    campaign_id: campaignId,
    email: email || "unknown",
    kind,
    resend_message_id: messageId,
    meta: type,
  });

  const statField = kindToStat(kind);
  if (statField) {
    await bumpEmailCampaignStat(campaignId, statField, 1);
  }

  if (kind === "complained" || kind === "bounced") {
    if (email) {
      const contacts = await listContacts();
      const contact =
        contacts.find(
          (c) => c.email.trim().toLowerCase() === email.toLowerCase()
        ) ?? null;
      await addEmailSuppression({
        email,
        reason: kind === "complained" ? "complaint" : "bounce",
        contact_id: contact?.id ?? null,
        campaign_id: campaignId,
      });
      if (contact && kind === "complained") {
        await updateContact(contact.id, { marketing_consent: false });
      }
    }
  }

  return jsonOk({ ok: true });
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

function kindToStat(
  kind: EmailEventKind
):
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "complained"
  | "unsubscribed"
  | null {
  if (kind === "delivered") return "delivered";
  if (kind === "opened") return "opened";
  if (kind === "clicked") return "clicked";
  if (kind === "bounced") return "bounced";
  if (kind === "complained") return "complained";
  if (kind === "unsubscribed") return "unsubscribed";
  return null;
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

function extractCampaignId(data: Record<string, unknown>): string | null {
  const tags = data.tags;
  if (Array.isArray(tags)) {
    for (const t of tags) {
      if (
        t &&
        typeof t === "object" &&
        "name" in t &&
        "value" in t &&
        String((t as { name: string }).name) === "campaign_id"
      ) {
        return String((t as { value: string }).value);
      }
    }
  }
  if (typeof data.campaign_id === "string") return data.campaign_id;
  return null;
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
