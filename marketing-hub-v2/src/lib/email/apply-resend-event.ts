import {
  addEmailSuppression,
  appendEmailEvent,
  bumpEmailCampaignStat,
  findEmailSuppression,
  listAddressDeliveryEvents,
  listContacts,
  updateContact,
} from "@/lib/data/repos";
import {
  bounceEventMeta,
  HARD_BOUNCE_NOTE,
  repeatedSoftBounceNote,
  SOFT_BOUNCE_LIMIT,
  shouldSuppressBounce,
} from "@/lib/email/bounce-policy";
import type { BounceClass } from "@/lib/email/resend-event";
import type { EmailEventKind } from "@/lib/types";
import {
  notifyPortalCampaignEngagement,
  notifyPortalSuppression,
} from "@/lib/sync/portal-marketing";

export type ResendEventJob = {
  type: string;
  kind: EmailEventKind;
  email: string;
  messageId: string;
  campaignId: string;
  link: string;
  userAgent: string;
  occurredAt: string;
  /** Absent on events queued before hard and soft bounces were split. */
  bounceClass?: BounceClass | null;
};

/** Store one Resend event and tell the Portal. Safe to retry. */
export async function applyResendEvent(job: ResendEventJob): Promise<{ ok: true }> {
  console.log("[email] resend event", job.kind, job.campaignId);
  const bounceClass = job.kind === "bounced" ? (job.bounceClass ?? "hard") : null;
  const priorDelivery = bounceClass && job.email
    ? await listAddressDeliveryEvents(job.email)
    : [];

  await appendEmailEvent({
    campaign_id: job.campaignId,
    email: job.email || "unknown",
    kind: job.kind,
    resend_message_id: job.messageId,
    meta: bounceClass ? bounceEventMeta(bounceClass) : job.type,
    link: job.link,
    user_agent: job.userAgent,
    created_at: job.occurredAt || undefined,
  });

  if (!job.email) return { ok: true };

  if (job.kind === "opened" || job.kind === "clicked" || job.kind === "unsubscribed") {
    const contacts = await listContacts();
    const contact =
      contacts.find((c) => c.email.trim().toLowerCase() === job.email.toLowerCase()) ??
      null;
    await notifyPortalCampaignEngagement({
      email: job.email,
      portalContactId: contact?.portal_contact_id,
      campaignId: job.campaignId,
      kind: job.kind,
      occurredAt: job.occurredAt || undefined,
    });
  }

  if (bounceClass) {
    await applyBounce(job, bounceClass, priorDelivery);
    return { ok: true };
  }

  if (job.kind === "complained") {
    const contacts = await listContacts();
    const contact =
      contacts.find((c) => c.email.trim().toLowerCase() === job.email.toLowerCase()) ??
      null;
    const alreadySuppressed = await findEmailSuppression(job.email);
    await addEmailSuppression({
      email: job.email,
      reason: "complaint",
      contact_id: contact?.id ?? null,
      campaign_id: job.campaignId,
    });
    if (!alreadySuppressed) {
      await bumpEmailCampaignStat(job.campaignId, "complained", 1);
    }
    if (contact) {
      await updateContact(contact.id, { marketing_consent: false });
    }
    await notifyPortalSuppression({
      email: job.email,
      portalContactId: contact?.portal_contact_id,
      reason: "complaint",
    });
  }

  return { ok: true };
}

async function applyBounce(
  job: ResendEventJob,
  bounceClass: BounceClass,
  priorDelivery: Awaited<ReturnType<typeof listAddressDeliveryEvents>>
) {
  const contacts = await listContacts();
  const contact =
    contacts.find((c) => c.email.trim().toLowerCase() === job.email.toLowerCase()) ??
    null;
  const decision = shouldSuppressBounce({
    bounceClass,
    events: [
      ...priorDelivery
        .filter((event) => event.kind === "bounced" || event.kind === "delivered")
        .map((event) => ({
          kind: event.kind as "bounced" | "delivered",
          meta: event.meta,
          createdAt: event.created_at,
          messageId: event.resend_message_id,
        })),
      {
        kind: "bounced" as const,
        meta: bounceEventMeta(bounceClass),
        createdAt: job.occurredAt || new Date().toISOString(),
        messageId: job.messageId,
      },
    ],
  });

  const alreadySuppressed = await findEmailSuppression(job.email);
  if (decision.suppress) {
    await addEmailSuppression({
      email: job.email,
      reason: "bounce",
      detail:
        bounceClass === "soft" && decision.softCount >= SOFT_BOUNCE_LIMIT
          ? repeatedSoftBounceNote(decision.softCount)
          : HARD_BOUNCE_NOTE,
      contact_id: contact?.id ?? null,
      campaign_id: job.campaignId,
    });
    if (!alreadySuppressed) {
      await notifyPortalSuppression({
        email: job.email,
        portalContactId: contact?.portal_contact_id,
        reason: "bounce",
      });
    }
  }

  const alreadyCounted = priorDelivery.some(
    (event) => event.kind === "bounced" && event.campaign_id === job.campaignId
  );
  if (!alreadyCounted) {
    await bumpEmailCampaignStat(job.campaignId, "bounced", 1);
  }
}
