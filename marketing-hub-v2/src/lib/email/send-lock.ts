import { createHash } from "crypto";
import type { EmailCampaign, EmailCampaignStatus } from "@/lib/types";

/** A send with no heartbeat for this long is treated as stopped and can be resumed. */
export const SEND_LOCK_MS = 8 * 60 * 1000;
/** How often a running send refreshes its heartbeat. Well under the lock. */
export const SEND_HEARTBEAT_MS = 60 * 1000;

type LockFields = Pick<EmailCampaign, "status" | "updated_at" | "scheduled_at"> &
  Partial<Pick<EmailCampaign, "send_claim" | "send_heartbeat_at">>;

/** Last sign of life from the runner that holds the send. */
export function sendHeartbeatAt(campaign: LockFields): number {
  const raw = campaign.send_heartbeat_at || campaign.updated_at;
  const at = raw ? new Date(raw).getTime() : 0;
  return Number.isNaN(at) ? 0 : at;
}

export function sendLockExpired(campaign: LockFields, now = Date.now()): boolean {
  return now - sendHeartbeatAt(campaign) >= SEND_LOCK_MS;
}

export type ClaimRule = {
  /** Statuses a claim may start from. "sending" is only taken over once the lock expires. */
  from: EmailCampaignStatus[];
  /** Only claim a scheduled campaign once its time has passed. */
  dueOnly?: boolean;
};

/** Whether a new runner may take the send. Run inside a store mutation so the check is atomic. */
export function canClaimSend(
  campaign: LockFields,
  rule: ClaimRule,
  now = Date.now()
): boolean {
  if (campaign.status === "sent") return false;
  if (!rule.from.includes(campaign.status)) return false;
  if (campaign.status === "sending") return sendLockExpired(campaign, now);
  if (rule.dueOnly && campaign.status === "scheduled") {
    const due = campaign.scheduled_at ? new Date(campaign.scheduled_at).getTime() : NaN;
    return !Number.isNaN(due) && due <= now;
  }
  return true;
}

/** The runner still owns the send. False after a cancel or a takeover. */
export function holdsSend(campaign: LockFields, claim: string): boolean {
  return Boolean(claim) && campaign.status === "sending" && campaign.send_claim === claim;
}

/** Same run and same recipients give the same key. Resend allows up to 256 chars. */
export function batchIdempotencyKey(
  campaignId: string,
  claim: string,
  emails: string[]
): string {
  const recipients = emails
    .map((email) => email.trim().toLowerCase())
    .sort()
    .join("\n");
  const digest = createHash("sha256").update(recipients).digest("hex").slice(0, 32);
  return `campaign-batch/${campaignId.slice(0, 80)}/${claim.slice(0, 60)}/${digest}`;
}
