import {
  addEmailSuppression,
  appendEmailEvent,
  bumpEmailCampaignStat,
  findEmailSuppression,
  listContacts,
  updateContact,
} from "@/lib/data/repos";
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
};

/** Store one Resend event and tell the Portal. Safe to retry. */
export async function applyResendEvent(job: ResendEventJob): Promise<{ ok: true }> {
  console.log("[email] resend event", job.kind, job.campaignId);
  await appendEmailEvent({
    campaign_id: job.campaignId,
    email: job.email || "unknown",
    kind: job.kind,
    resend_message_id: job.messageId,
    meta: job.type,
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

  if (job.kind === "complained" || job.kind === "bounced") {
    const contacts = await listContacts();
    const contact =
      contacts.find((c) => c.email.trim().toLowerCase() === job.email.toLowerCase()) ??
      null;
    const alreadySuppressed = await findEmailSuppression(job.email);
    await addEmailSuppression({
      email: job.email,
      reason: job.kind === "complained" ? "complaint" : "bounce",
      contact_id: contact?.id ?? null,
      campaign_id: job.campaignId,
    });
    if (!alreadySuppressed) {
      await bumpEmailCampaignStat(
        job.campaignId,
        job.kind === "complained" ? "complained" : "bounced",
        1
      );
    }
    if (contact && job.kind === "complained") {
      await updateContact(contact.id, { marketing_consent: false });
    }
    await notifyPortalSuppression({
      email: job.email,
      portalContactId: contact?.portal_contact_id,
      reason: job.kind === "complained" ? "complaint" : "bounce",
    });
  }

  return { ok: true };
}
