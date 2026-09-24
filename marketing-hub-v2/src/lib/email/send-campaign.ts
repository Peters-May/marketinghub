import { Resend } from "resend";
import {
  appendEmailEvent,
  getEmailCampaign,
  resolveEmailRecipients,
  updateEmailCampaign,
} from "@/lib/data/repos";
import { applyEmailMerge, ensureUnsubscribeFooter } from "@/lib/email/merge";
import { unsubscribeUrlFor } from "@/lib/email/unsubscribe-token";
import {
  notifyPortalCampaignSend,
  syncPortalMarketingAudience,
} from "@/lib/sync/portal-marketing";
import type { EmailCampaign } from "@/lib/types";

const BATCH_PAUSE_MS = 80;

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
  campaignId: string
): Promise<SendCampaignResult> {
  const campaign = await getEmailCampaign(campaignId);
  if (!campaign) {
    return { ok: false, campaign: null, sent: 0, failed: 0, error: "Not found" };
  }
  if (campaign.status === "sending") {
    return {
      ok: false,
      campaign,
      sent: 0,
      failed: 0,
      error: "Campaign is already sending",
    };
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
    await syncPortalMarketingAudience();
  } catch (err) {
    console.error("[send-campaign] portal audience", err);
  }

  const recipients = await resolveEmailRecipients({
    audienceId: campaign.audience_id,
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
    "marketing@petersandmay.com";
  const from = latest.from_name.trim()
    ? `${latest.from_name.trim()} <${fromEmail}>`
    : fromEmail;

  const htmlBase = ensureUnsubscribeFooter(latest.html_body || "<p></p>");
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const contact of recipients) {
    const email = contact.email.trim();
    const unsub = unsubscribeUrlFor({
      email,
      campaignId,
      contactId: contact.id,
    });
    const html = applyEmailMerge(htmlBase, {
      contact,
      unsubscribeUrl: unsub,
    });
    const subject = applyEmailMerge(latest.subject || latest.title, {
      contact,
      unsubscribeUrl: unsub,
    });

    try {
      const result = await resend.emails.send({
        from,
        to: email,
        subject,
        html,
        tags: [
          { name: "campaign_id", value: campaignId.slice(0, 50) },
          { name: "hub", value: "marketing" },
        ],
      });

      const messageId =
        result.data && "id" in result.data
          ? String((result.data as { id: string }).id)
          : "";

      if (result.error) {
        failed += 1;
        errors.push(`${email}: ${result.error.message}`);
      } else {
        sent += 1;
        await appendEmailEvent({
          campaign_id: campaignId,
          contact_id: contact.id,
          email,
          kind: "sent",
          resend_message_id: messageId,
        });
        await notifyPortalCampaignSend({
          contact,
          campaignId,
          campaignTitle: latest.title || latest.subject || "Marketing email",
          sentAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : "send failed";
      errors.push(`${email}: ${msg}`);
    }

    await sleep(BATCH_PAUSE_MS);
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
