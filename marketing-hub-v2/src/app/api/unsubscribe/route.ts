import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/api";
import {
  addEmailSuppression,
  appendEmailEvent,
  bumpEmailCampaignStat,
  listContacts,
  updateContact,
} from "@/lib/data/repos";
import { parseUnsubscribeToken } from "@/lib/email/unsubscribe-token";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const token = String(body.token ?? "");
  const parsed = parseUnsubscribeToken(token);
  if (!parsed) return jsonError("Invalid or expired unsubscribe link", 400);

  const contacts = await listContacts();
  const contact =
    (parsed.contactId
      ? contacts.find((c) => c.id === parsed.contactId)
      : null) ??
    contacts.find(
      (c) => c.email.trim().toLowerCase() === parsed.email.toLowerCase()
    ) ??
    null;

  await addEmailSuppression({
    email: parsed.email,
    reason: "unsubscribe",
    contact_id: contact?.id ?? null,
    campaign_id: parsed.campaignId || null,
  });

  if (contact) {
    await updateContact(contact.id, { marketing_consent: false });
  }

  if (parsed.campaignId) {
    await appendEmailEvent({
      campaign_id: parsed.campaignId,
      contact_id: contact?.id ?? null,
      email: parsed.email,
      kind: "unsubscribed",
    });
    await bumpEmailCampaignStat(parsed.campaignId, "unsubscribed", 1);
  }

  return jsonOk({ ok: true, email: parsed.email });
}
