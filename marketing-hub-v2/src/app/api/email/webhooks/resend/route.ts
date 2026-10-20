import { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { jsonError, jsonOk } from "@/lib/api";
import {
  addEmailSuppression,
  appendEmailEvent,
  bumpEmailCampaignStat,
  findEmailSuppression,
  listContacts,
  updateContact,
} from "@/lib/data/repos";
import { readResendEventDetail } from "@/lib/email/resend-event";
import { notifyPortalCampaignEngagement, notifyPortalSuppression } from "@/lib/sync/portal-marketing";
import type { EmailEventKind } from "@/lib/types";

/**
 * Resend webhook. Opens, clicks and deliveries are stored as rows.
 * The hub document is not rewritten for each event.
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
  const detail = readResendEventDetail(data);
  const campaignId = detail.campaignId;
  if (!campaignId) return jsonOk({ ok: true, skipped: "no campaign_id" });

  await appendEmailEvent({
    campaign_id: campaignId,
    email: email || "unknown",
    kind,
    resend_message_id: messageId,
    meta: type,
    link: detail.link,
    user_agent: detail.userAgent,
    created_at: detail.occurredAt || undefined,
  });

  if (kind === "opened" || kind === "clicked" || kind === "unsubscribed") {
    if (email) {
      const contacts = await listContacts();
      const contact =
        contacts.find(
          (c) => c.email.trim().toLowerCase() === email.toLowerCase()
        ) ?? null;
      await notifyPortalCampaignEngagement({
        email,
        portalContactId: contact?.portal_contact_id,
        campaignId,
        kind,
        occurredAt: detail.occurredAt || undefined,
      });
    }
  }

  if (kind === "complained" || kind === "bounced") {
    if (email) {
      const contacts = await listContacts();
      const contact =
        contacts.find(
          (c) => c.email.trim().toLowerCase() === email.toLowerCase()
        ) ?? null;
      const alreadySuppressed = await findEmailSuppression(email);
      await addEmailSuppression({
        email,
        reason: kind === "complained" ? "complaint" : "bounce",
        contact_id: contact?.id ?? null,
        campaign_id: campaignId,
      });
      if (!alreadySuppressed) {
        await bumpEmailCampaignStat(
          campaignId,
          kind === "complained" ? "complained" : "bounced",
          1
        );
      }
      if (contact && kind === "complained") {
        await updateContact(contact.id, { marketing_consent: false });
      }
      await notifyPortalSuppression({
        email,
        portalContactId: contact?.portal_contact_id,
        reason: kind === "complained" ? "complaint" : "bounce",
      });
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
