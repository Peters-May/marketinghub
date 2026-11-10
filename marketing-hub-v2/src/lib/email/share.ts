import { brandedHubEmailHtml } from "@/lib/email/brand-shell";
import { previewMerge } from "@/lib/email/design/preview";
import type { ShareAudience } from "@/lib/types";

/** Same shape as a social share token: unguessable, URL-safe, not a path. */
function isEmailShareToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{16,128}$/.test(token);
}

/**
 * The email is served on the app's own origin, so it must not be able to
 * run script there. The sandbox also gives the page an opaque origin, so
 * nothing in it can read the hub's cookies or storage. Links still open.
 * allow-downloads is required: gallery share CTAs redirect to a forced
 * attachment download, and Chromium blocks that from sandboxed docs without it.
 */
export const EMAIL_DOCUMENT_HEADERS = {
  "content-security-policy": [
    "default-src 'none'",
    "img-src https: http: data:",
    "style-src 'unsafe-inline' https:",
    "font-src https: data:",
    "script-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'self'",
    "sandbox allow-downloads allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation",
  ].join("; "),
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

export type PublicEmailDraft = {
  title: string;
  subject: string;
  html_body: string;
  sent: boolean;
  audience: ShareAudience;
  kind: "campaign" | "template";
  id: string;
};

export function emailSharePath(token: string): string {
  const trimmed = token.trim();
  if (!isEmailShareToken(trimmed)) return "";
  return `/share/email/${encodeURIComponent(trimmed)}`;
}

export function emailShareDocumentPath(token: string): string {
  const trimmed = token.trim();
  if (!isEmailShareToken(trimmed)) return "";
  return `/share/email/${encodeURIComponent(trimmed)}/document`;
}

/** Drop share fields so a normal save cannot publish or rewrite the link. */
export function omitEmailSharePatch(patch: object): Record<string, unknown> {
  const next = { ...(patch as Record<string, unknown>) };
  delete next.share_token;
  delete next.share_enabled;
  delete next.client_share_token;
  delete next.client_share_enabled;
  delete next.share_latest_decision;
  delete next.share_latest_approved_by;
  delete next.share_latest_responded_at;
  return next;
}

export function toPublicEmailDraft(
  record: {
    share_enabled?: boolean;
    share_token?: string;
    client_share_token?: string;
    client_share_enabled?: boolean;
    title: string;
    subject: string;
    html_body: string;
    sent?: boolean;
    id?: string;
    kind?: "campaign" | "template";
  },
  token: string,
  audience: ShareAudience = "staff"
): PublicEmailDraft | null {
  const trimmed = token.trim();
  if (!isEmailShareToken(trimmed)) return null;
  return {
    title: record.title,
    subject: record.subject,
    html_body: record.html_body,
    sent: record.sent === true,
    audience,
    kind: record.kind === "template" ? "template" : "campaign",
    id: String(record.id ?? ""),
  };
}

export function unavailableEmailPreviewHtml(): string {
  return brandedHubEmailHtml({
    eyebrow: "Marketing Hub · Email",
    heading: "Preview unavailable",
    title: "Email preview",
    bodyHtml:
      '<p style="margin:0;">This email preview is not available.</p>',
    footerNote: "Peters & May Marketing Hub",
  }).replace(
    "<head>",
    '<head><meta name="robots" content="noindex, nofollow">'
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Saved draft HTML with sample merge data and a banner. Footer links stay inert. */
export function renderPublicEmailHtml(input: {
  subject: string;
  html: string;
  shareUrl: string;
  sent?: boolean;
}): string {
  const subjectText =
    previewMerge(input.subject || "Untitled email", { format: "text" }).trim() ||
    "Untitled email";
  const safeSubject = escapeHtml(subjectText);
  const notice = input.sent
    ? "This is the saved copy of a sent email."
    : "This email has not been sent.";
  const banner = `<div style="margin:0;padding:12px 16px;background:#E3E6E9;color:#0B2545;font-family:Arial,sans-serif;font-size:13px;line-height:1.45;text-align:center;"><strong>Draft preview</strong> · Peters &amp; May<br>${safeSubject}<br><span style="color:#1B3A5B;">${notice} Sample names stand in for merge fields.</span></div>`;
  const source = input.html.trim()
    ? previewMerge(input.html, {
        viewInBrowserUrl: input.shareUrl,
        unsubscribeUrl: "#",
        preferencesUrl: "#",
      })
    : `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><p style="margin:24px;font-family:Arial,sans-serif;color:#0B2545;">This draft has no content yet.</p></body></html>`;

  let doc = source;
  if (/<title>[\s\S]*?<\/title>/i.test(doc)) {
    doc = doc.replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeSubject}</title>`);
  } else if (/<head[^>]*>/i.test(doc)) {
    doc = doc.replace(/<head([^>]*)>/i, `<head$1><title>${safeSubject}</title>`);
  }
  if (/<head[^>]*>/i.test(doc) && !/name=["']robots["']/i.test(doc)) {
    doc = doc.replace(
      /<head([^>]*)>/i,
      `<head$1><meta name="robots" content="noindex, nofollow">`
    );
  }
  if (/<body[^>]*>/i.test(doc)) {
    return doc.replace(/<body([^>]*)>/i, `<body$1>${banner}`);
  }
  return `${banner}${doc}`;
}
