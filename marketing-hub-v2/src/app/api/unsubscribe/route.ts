import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/api";
import {
  addEmailSuppression,
  appendEmailEvent,
  bumpEmailCampaignStat,
  findEmailSuppression,
  listContacts,
  removeUnsubscribeSuppression,
  updateContact,
} from "@/lib/data/repos";
import {
  EMAIL_PREFERENCE_TOPICS,
  formatUnsubscribeFeedback,
  isUnsubscribeFeedbackReason,
  normalizeTopicOptOuts,
  topicForAudienceName,
  type EmailPreferenceTopic,
} from "@/lib/email/preferences";
import { parseUnsubscribeToken } from "@/lib/email/unsubscribe-token";
import { readStore } from "@/lib/store/local";
import {
  notifyPortalCampaignEngagement,
  notifyPortalPreferences,
  notifyPortalSuppression,
} from "@/lib/sync/portal-marketing";
import type { Contact } from "@/lib/types";

async function topicForCampaign(campaignId: string): Promise<EmailPreferenceTopic | null> {
  if (!campaignId) return null;
  const store = await readStore();
  const campaign = (store.email_campaigns ?? []).find((item) => item.id === campaignId);
  if (!campaign?.audience_id) return null;
  const audience = (store.email_audiences ?? []).find(
    (item) => item.id === campaign.audience_id
  );
  return topicForAudienceName(audience?.name ?? "");
}

function findContact(
  contacts: Contact[],
  parsed: { email: string; contactId: string }
): Contact | null {
  return (
    (parsed.contactId
      ? contacts.find((c) => c.id === parsed.contactId)
      : null) ??
    contacts.find(
      (c) => c.email.trim().toLowerCase() === parsed.email.toLowerCase()
    ) ??
    null
  );
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const parsed = parseUnsubscribeToken(token);
  if (!parsed) return jsonError("Invalid or expired link", 400);

  const contacts = await listContacts();
  const contact = findContact(contacts, parsed);
  const suppression = await findEmailSuppression(parsed.email);
  const locked =
    suppression?.reason === "bounce" || suppression?.reason === "complaint";
  const all = locked || suppression?.reason === "unsubscribe" || contact?.marketing_consent === false;
  const topics = all
    ? EMAIL_PREFERENCE_TOPICS.map((topic) => topic.id)
    : normalizeTopicOptOuts(contact?.email_topic_opt_outs);

  return jsonOk({
    email: parsed.email,
    topics,
    all,
    locked,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const token = String(body.token ?? "");
  const parsed = parseUnsubscribeToken(token);
  if (!parsed) return jsonError("Invalid or expired link", 400);

  const requested = normalizeTopicOptOuts(body.topics);
  const wantsAll = body.all === true || requested.length === EMAIL_PREFERENCE_TOPICS.length;
  const contacts = await listContacts();
  const contact = findContact(contacts, parsed);
  const suppression = await findEmailSuppression(parsed.email);
  const locked =
    suppression?.reason === "bounce" || suppression?.reason === "complaint";

  if (locked) {
    return jsonError(
      "This address is stopped because messages could not be delivered.",
      400
    );
  }

  const topics: EmailPreferenceTopic[] = wantsAll
    ? EMAIL_PREFERENCE_TOPICS.map((topic) => topic.id)
    : requested;
  const previous = normalizeTopicOptOuts(contact?.email_topic_opt_outs);
  const wasAll =
    suppression?.reason === "unsubscribe" || contact?.marketing_consent === false;
  const isOptingOut = wantsAll || topics.length > 0;
  const alreadyOptedOut = wasAll || previous.length > 0;
  const feedback = formatUnsubscribeFeedback({
    reason: body.unsubscribe_reason,
    other: body.unsubscribe_other,
  });

  if (isOptingOut && !alreadyOptedOut) {
    const reasonId =
      typeof body.unsubscribe_reason === "string" ? body.unsubscribe_reason : "";
    if (!isUnsubscribeFeedbackReason(reasonId)) {
      return jsonError("Please choose a reason for unsubscribing.", 400);
    }
    if (reasonId === "other") {
      const other =
        typeof body.unsubscribe_other === "string"
          ? body.unsubscribe_other.trim()
          : "";
      if (!other) {
        return jsonError("Please tell us a little more.", 400);
      }
    }
  }

  if (contact) {
    const patch: Partial<Contact> = { email_topic_opt_outs: topics };
    if (wantsAll) patch.marketing_consent = false;
    else if (wasAll) patch.marketing_consent = true;
    await updateContact(contact.id, patch);
  }

  if (wantsAll) {
    await addEmailSuppression({
      email: parsed.email,
      reason: "unsubscribe",
      detail: feedback || null,
      contact_id: contact?.id ?? null,
      campaign_id: parsed.campaignId || null,
    });
    await notifyPortalSuppression({
      email: parsed.email,
      portalContactId: contact?.portal_contact_id,
      reason: "unsubscribe",
    });
  } else if (wasAll) {
    await removeUnsubscribeSuppression(parsed.email);
  }

  await notifyPortalPreferences({
    email: parsed.email,
    portalContactId: contact?.portal_contact_id,
    optOuts: topics,
    all: wantsAll,
    liftUnsubscribe: !wantsAll && wasAll,
  });

  const campaignTopic = parsed.campaignId
    ? await topicForCampaign(parsed.campaignId)
    : null;
  const stopsThisCampaign =
    Boolean(parsed.campaignId) &&
    (wantsAll || (campaignTopic != null && topics.includes(campaignTopic)));
  const alreadyStopped =
    wasAll || (campaignTopic != null && previous.includes(campaignTopic));
  if (stopsThisCampaign && !alreadyStopped && parsed.campaignId) {
    await notifyPortalCampaignEngagement({
      email: parsed.email,
      portalContactId: contact?.portal_contact_id,
      campaignId: parsed.campaignId,
      kind: "unsubscribed",
    });
    await appendEmailEvent({
      campaign_id: parsed.campaignId,
      contact_id: contact?.id ?? null,
      email: parsed.email,
      kind: "unsubscribed",
      meta: feedback,
    });
    await bumpEmailCampaignStat(parsed.campaignId, "unsubscribed", 1);
  }

  return jsonOk({
    ok: true,
    email: parsed.email,
    topics,
    all: wantsAll,
  });
}
