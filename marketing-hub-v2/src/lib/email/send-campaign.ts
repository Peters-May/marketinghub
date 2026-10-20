import { Resend } from "resend";
import {
  appendEmailEvents,
  getEmailCampaign,
  listEmailAudiences,
  listEmailEvents,
  resolveEmailRecipients,
  updateEmailCampaign,
} from "@/lib/data/repos";
import { compileEmailDesign, resolveEmailDesign } from "@/lib/email/design";
import {
  applyEmailMerge,
  ensureUnsubscribeFooter,
  ensureViewInBrowserLink,
} from "@/lib/email/merge";
import { topicForAudienceName } from "@/lib/email/preferences";
import { unsubscribeUrlFor, viewInBrowserUrlFor } from "@/lib/email/unsubscribe-token";
import { appendUtmToEmailHtml } from "@/lib/email/utm";
import {
  notifyPortalCampaignSend,
  syncPortalMarketingAudience,
} from "@/lib/sync/portal-marketing";
import type { Contact, EmailCampaign } from "@/lib/types";

const BATCH_SIZE = 40;
const BATCH_PAUSE_MS = 250;
/** Ignore a second start while a send is still in progress. */
const SENDING_LOCK_MS = 8 * 60 * 1000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export type SendCampaignResult = {
  ok: boolean;
  campaign: EmailCampaign | null;
  sent: number;
  failed: number;
  error?: string;
};

/**
 * Resolve recipients and send via Resend. Soft-fails if API key missing.
 * Updates campaign status and per-recipient "sent" events.
 */
export async function sendEmailCampaign(
  campaignId: string,
  opts?: { claimed?: boolean }
): Promise<SendCampaignResult> {
  const campaign = await getEmailCampaign(campaignId);
  if (!campaign) {
    return { ok: false, campaign: null, sent: 0, failed: 0, error: "Not found" };
  }
  if (campaign.status === "sending" && !opts?.claimed) {
    const started = new Date(campaign.updated_at).getTime();
    if (Date.now() - started < SENDING_LOCK_MS) {
      return {
        ok: false,
        campaign,
        sent: 0,
        failed: 0,
        error: "Campaign is already sending",
      };
    }
  }
  if (campaign.status === "sent") {
    return {
      ok: false,
      campaign,
      sent: 0,
      failed: 0,
      error: "Campaign already sent",
    };
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    const updated = await updateEmailCampaign(campaignId, {
      status: "failed",
      last_error: "RESEND_API_KEY not configured",
    });
    return {
      ok: false,
      campaign: updated,
      sent: 0,
      failed: 0,
      error: "Email not configured (RESEND_API_KEY)",
    };
  }

  try {
    await syncPortalMarketingAudience({ includeLists: false });
  } catch (err) {
    console.error("[send-campaign] portal audience", err);
  }

  const recipients = await resolveEmailRecipients({
    audienceId: campaign.audience_id,
    excludeAudienceId: campaign.exclude_audience_id,
    listIds: campaign.list_ids,
    recipientIds: campaign.recipient_ids,
  });

  if (recipients.length === 0) {
    const updated = await updateEmailCampaign(campaignId, {
      status: "failed",
      last_error:
        "No consented recipients (marketing opt-in required; check audience and suppressions)",
    });
    return {
      ok: false,
      campaign: updated,
      sent: 0,
      failed: 0,
      error: "No recipients",
    };
  }

  await updateEmailCampaign(campaignId, {
    status: "sending",
    last_error: "",
    stats: {
      ...campaign.stats,
      recipients: recipients.length,
    },
  });

  // Re-read in case we were already mid-send from scheduler
  const latest = await getEmailCampaign(campaignId);
  if (!latest) {
    return { ok: false, campaign: null, sent: 0, failed: 0, error: "Not found" };
  }

  const resend = new Resend(apiKey);
  const fromEmail =
    latest.from_email.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "hello@petersandmay.com";
  const from = latest.from_name.trim()
    ? `${latest.from_name.trim()} <${fromEmail}>`
    : fromEmail;

  let topic: ReturnType<typeof topicForAudienceName> = null;
  if (latest.audience_id) {
    const audiences = await listEmailAudiences();
    const audience = audiences.find((row) => row.id === latest.audience_id);
    topic = topicForAudienceName(audience?.name ?? "");
  }
  const design = resolveEmailDesign(latest.design, latest.html_body || "");
  const compiled = compileEmailDesign(design, {
    topic: topic ?? "all",
  });
  const htmlBase = appendUtmToEmailHtml(
    ensureViewInBrowserLink(ensureUnsubscribeFooter(compiled || latest.html_body || "<p></p>")),
    { campaign: latest.title || latest.id }
  );
  const alreadySent = new Set(
    (await listEmailEvents(campaignId))
      .filter((event) => event.kind === "sent")
      .map((event) => event.email.trim().toLowerCase())
  );
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  const pending = recipients.filter(
    (contact) => !alreadySent.has(contact.email.trim().toLowerCase())
  );
  sent += recipients.length - pending.length;

  for (let index = 0; index < pending.length; index += BATCH_SIZE) {
    const chunk = pending.slice(index, index + BATCH_SIZE);
    const prepared = chunk.map((contact) => {
      const email = contact.email.trim();
      const identity = { email, campaignId, contactId: contact.id };
      const unsub = unsubscribeUrlFor(identity);
      const browser = viewInBrowserUrlFor(identity);
      return {
        contact,
        email,
        payload: {
          from,
          to: email,
          subject: applyEmailMerge(latest.subject || latest.title, {
            contact,
            unsubscribeUrl: unsub,
            viewInBrowserUrl: browser,
          }),
          html: applyEmailMerge(htmlBase, {
            contact,
            unsubscribeUrl: unsub,
            viewInBrowserUrl: browser,
          }),
          tags: [
            { name: "campaign_id", value: campaignId.slice(0, 50) },
            { name: "hub", value: "marketing" },
          ],
        },
      };
    });

    let ids: Array<string | null> = prepared.map(() => null);
    let chunkError = "";
    try {
      const result = await resend.batch.send(
        prepared.map((item) => item.payload),
        { batchValidation: "permissive" }
      );
      if (result.error) {
        chunkError = result.error.message;
      } else {
        ids = batchMessageIds(result.data, prepared.length);
      }
    } catch (err) {
      chunkError = err instanceof Error ? err.message : "send failed";
    }

    const recorded: Parameters<typeof appendEmailEvents>[0] = [];
    const sentAt = new Date().toISOString();
    prepared.forEach((item, itemIndex) => {
      const messageId = ids[itemIndex];
      if (!messageId) {
        failed += 1;
        errors.push(`${item.email}: ${chunkError || "Not accepted"}`);
        return;
      }
      sent += 1;
      recorded.push({
        campaign_id: campaignId,
        contact_id: item.contact.id,
        email: item.email,
        kind: "sent",
        resend_message_id: messageId,
        created_at: sentAt,
      });
      void notifyPortalCampaignSend({
        contact: item.contact,
        campaignId,
        campaignTitle: latest.title || latest.subject || "Marketing email",
        sentAt,
      });
    });

    if (recorded.length === 0) break;
    await appendEmailEvents(recorded);
    console.log("[email] recorded", sent, "of", recipients.length);
    if (index + BATCH_SIZE < pending.length) await sleep(BATCH_PAUSE_MS);
  }

  const finalStatus = sent > 0 ? "sent" : "failed";
  const updated = await updateEmailCampaign(campaignId, {
    status: finalStatus,
    sent_at: sent > 0 ? new Date().toISOString() : null,
    last_error: errors.slice(0, 5).join("; "),
    stats: {
      ...latest.stats,
      recipients: recipients.length,
    },
  });

  return {
    ok: sent > 0,
    campaign: updated,
    sent,
    failed,
    error: sent === 0 ? errors[0] || "All sends failed" : undefined,
  };
}

/** One copy to the signed-in sender. Does not change the campaign. */
export async function sendTestEmail(input: {
  to: string;
  toName: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  html: string;
  campaignId?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const to = input.to.trim();
  if (!to) return { ok: false, error: "No email address on your account" };
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: "Email is not configured" };

  const fromEmail =
    input.fromEmail.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "hello@petersandmay.com";
  const from = input.fromName.trim()
    ? `${input.fromName.trim()} <${fromEmail}>`
    : fromEmail;
  const contact = {
    id: "test",
    name: input.toName || to,
    email: to,
    organisation: "Peters & May",
    role: "",
    outlet: "",
    country: "United Kingdom",
  } as Contact;
  const identity = {
    email: to,
    campaignId: input.campaignId?.trim() || "test",
    contactId: "test",
  };
  const unsub = unsubscribeUrlFor(identity);
  const browser = viewInBrowserUrlFor(identity);
  const html = applyEmailMerge(
    ensureViewInBrowserLink(ensureUnsubscribeFooter(input.html || "<p></p>")),
    {
      contact,
      unsubscribeUrl: unsub,
      viewInBrowserUrl: browser,
    }
  );
  const subject = applyEmailMerge(input.subject || "Test email", {
    contact,
    unsubscribeUrl: unsub,
    viewInBrowserUrl: browser,
  });

  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from,
      to,
      subject: subject.startsWith("Test:") ? subject : `Test: ${subject}`,
      html,
    });
    if (result.error) return { ok: false, error: result.error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Test send failed" };
  }
}

function batchMessageIds(data: unknown, count: number): Array<string | null> {
  const list = Array.isArray(data)
    ? data
    : data &&
        typeof data === "object" &&
        Array.isArray((data as { data?: unknown }).data)
      ? (data as { data: unknown[] }).data
      : [];
  return Array.from({ length: count }, (_, index) => {
    const row = list[index];
    if (row && typeof row === "object" && "id" in row && (row as { id?: unknown }).id) {
      return String((row as { id: string }).id);
    }
    return null;
  });
}
