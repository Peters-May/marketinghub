import { createHmac, timingSafeEqual } from "crypto";

function secret(): string {
  return (
    process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim() ||
    process.env.RESEND_API_KEY?.trim() ||
    "marketing-hub-dev-unsubscribe"
  );
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** Encode email (+ optional campaign) into a URL-safe token. */
export function createUnsubscribeToken(opts: {
  email: string;
  campaignId?: string | null;
  contactId?: string | null;
}): string {
  const email = opts.email.trim().toLowerCase();
  const campaignId = opts.campaignId ?? "";
  const contactId = opts.contactId ?? "";
  const payload = `${email}|${campaignId}|${contactId}`;
  const sig = sign(payload);
  return Buffer.from(`${payload}|${sig}`, "utf8").toString("base64url");
}

export function parseUnsubscribeToken(token: string): {
  email: string;
  campaignId: string;
  contactId: string;
} | null {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf8");
    const parts = raw.split("|");
    if (parts.length !== 4) return null;
    const [email, campaignId, contactId, sig] = parts;
    if (!email || !sig) return null;
    const expected = sign(`${email}|${campaignId}|${contactId}`);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return { email, campaignId, contactId };
  } catch {
    return null;
  }
}

export function unsubscribeUrlFor(opts: {
  email: string;
  campaignId?: string | null;
  contactId?: string | null;
}): string {
  const origin = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const token = createUnsubscribeToken(opts);
  const path = `/unsubscribe?token=${encodeURIComponent(token)}`;
  return origin ? `${origin}${path}` : path;
}
