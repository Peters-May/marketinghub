/**
 * Shared Peters & May chrome for Hub transactional emails (Resend).
 * Auth templates live in docs/email-templates/brand-shell.mjs — keep colours aligned.
 */

export const EMAIL_BRAND = {
  navy: "#0B2545",
  blue: "#007DC5",
  mist: "#E3E6E9",
  page: "#F4F6F7",
  body: "#1B3A5B",
  muted: "#5B6472",
  white: "#FFFFFF",
} as const;

export const EMAIL_SITE_URL = "https://marketing.petersandmay.com";
/** Reverse Group lock-up for dark (navy) email headers. */
export const EMAIL_LOGO_PATH = "/pm-group-logo-rev.png";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function emailAppOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
}

export function emailLogoUrl(): string {
  const origin = emailAppOrigin();
  return origin
    ? `${origin}${EMAIL_LOGO_PATH}`
    : `${EMAIL_SITE_URL}${EMAIL_LOGO_PATH}`;
}

export type BrandedHubEmailProps = {
  /** Small uppercase label under the logo (escaped). */
  eyebrow: string;
  /** Main title in the navy header (escaped). */
  heading: string;
  /** Document <title> — defaults to heading. */
  title?: string;
  /**
   * Inner HTML already escaped / trusted markup.
   * Prefer building from escapeHtml() helpers in callers.
   */
  bodyHtml: string;
  ctaLabel?: string;
  ctaHref?: string;
  /** Note under the CTA / body (escaped). */
  footerNote?: string;
  /** Line under the card (escaped). Default: brand promise short form. */
  tagline?: string;
  maxWidth?: number;
};

/**
 * Aesthetic navy + P&M Blue shell for every Hub outbound transactional email.
 */
export function brandedHubEmailHtml(props: BrandedHubEmailProps): string {
  const {
    navy,
    blue,
    mist,
    page,
    body,
    muted,
    white,
  } = EMAIL_BRAND;
  const maxWidth = props.maxWidth ?? 600;
  const title = escapeHtml(props.title?.trim() || props.heading);
  const eyebrow = escapeHtml(props.eyebrow);
  const heading = escapeHtml(props.heading);
  const footerNote = props.footerNote?.trim()
    ? escapeHtml(props.footerNote.trim())
    : "";
  const tagline = escapeHtml(
    props.tagline?.trim() || "Peters & May — bespoke logistics"
  );

  const ctaHtml =
    props.ctaHref?.trim() && props.ctaLabel?.trim()
      ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0 0;">
  <tr>
    <td style="border-radius:6px;background:${blue};">
      <a href="${escapeHtml(props.ctaHref.trim())}" style="display:inline-block;padding:12px 20px;font-size:14px;font-weight:600;color:${white};text-decoration:none;">${escapeHtml(props.ctaLabel.trim())}</a>
    </td>
  </tr>
</table>`
      : "";

  const footerHtml = footerNote
    ? `<p style="margin:28px 0 0;font-size:12px;line-height:1.45;color:${muted};">${footerNote}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${page};font-family:Arial,Helvetica,sans-serif;line-height:1.55;color:${navy};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${page};padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:${maxWidth}px;background:${white};border-radius:10px;overflow:hidden;border:1px solid ${mist};">
          <tr>
            <td style="background:${navy};padding:22px 28px;">
              <img src="${escapeHtml(emailLogoUrl())}" alt="Peters &amp; May" width="220" style="display:block;max-width:220px;height:auto;border:0;"/>
              <p style="margin:16px 0 0;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#C5D0DB;">${eyebrow}</p>
              <h1 style="margin:8px 0 0;font-size:22px;line-height:1.3;color:${white};font-weight:700;">${heading}</h1>
            </td>
          </tr>
          <tr>
            <td style="background:${blue};height:4px;font-size:4px;line-height:4px;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:28px;color:${body};font-size:15px;">
              ${props.bodyHtml}
              ${ctaHtml}
              ${footerHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 22px;border-top:1px solid ${mist};background:#FAFBFC;">
              <p style="margin:0;font-size:12px;line-height:1.45;color:${muted};text-align:center;">
                Peters &amp; May · Marketing Hub<br/>
                <a href="${EMAIL_SITE_URL}" style="color:${navy};text-decoration:none;">marketing.petersandmay.com</a>
              </p>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-size:11px;color:${muted};">${tagline}</p>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

/** Detail rows inside branded body content. */
export function brandedDetailRowsHtml(
  rows: Array<{ label: string; value: string; href?: string }>
): string {
  const { navy, blue, mist, muted } = EMAIL_BRAND;
  const cells = rows
    .filter((row) => row.value.trim())
    .map((row) => {
      const value = row.href
        ? `<a href="${escapeHtml(row.href)}" style="color:${blue};">${escapeHtml(row.value)}</a>`
        : escapeHtml(row.value);
      return `<tr>
  <td style="padding:8px 0;width:120px;vertical-align:top;color:${muted};font-size:13px;">${escapeHtml(row.label)}</td>
  <td style="padding:8px 0;vertical-align:top;color:${navy};font-size:14px;">${value}</td>
</tr>`;
    })
    .join("");
  if (!cells) return "";
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid ${mist};border-bottom:1px solid ${mist};">${cells}</table>`;
}

/** Soft mist panel for quotes / transcripts / lists. */
export function brandedPanelHtml(label: string, innerHtml: string): string {
  const { mist, muted } = EMAIL_BRAND;
  if (!innerHtml.trim()) return "";
  return `<div style="margin-top:18px;padding:14px 16px;background:${mist};border-radius:8px;">
  <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:${muted};">${escapeHtml(label)}</p>
  ${innerHtml}
</div>`;
}
