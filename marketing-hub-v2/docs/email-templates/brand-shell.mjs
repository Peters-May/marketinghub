/**
 * Shared Marketing Hub Auth email chrome (header + footer).
 * Supabase does not support includes — each template inlines this shell.
 * Keep colours aligned with src/lib/email/brand-shell.ts.
 * Paste each HTML file into Dashboard → Authentication → Email Templates.
 */

export const LOGO_URL =
  "https://marketing.petersandmay.com/pm-group-logo.png";
export const SITE_URL = "https://marketing.petersandmay.com";
export const BRAND = "#0B2545";
export const ACCENT = "#007DC5";
export const MIST = "#E3E6E9";
export const PAGE = "#F4F6F7";
export const BODY = "#1B3A5B";
export const MUTED = "#5B6472";

/**
 * @param {{
 *   title: string;
 *   heading: string;
 *   paragraphs: string[];
 *   ctaLabel: string;
 *   ctaHref?: string;
 *   afterCtaHtml?: string;
 *   showFallbackLink?: boolean;
 * }} opts
 */
export function brandEmail({
  title,
  heading,
  paragraphs,
  ctaLabel,
  ctaHref = "{{ .ConfirmationURL }}",
  afterCtaHtml = "",
  showFallbackLink = true,
}) {
  const paras = paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:${BODY};">${p}</p>`
    )
    .join("\n");

  const fallback = showFallbackLink
    ? `<p style="margin:28px 0 0;font-size:13px;line-height:1.5;color:${MUTED};">
                  If the button doesn’t work, copy and paste this link into your browser:<br />
                  <a href="${ctaHref}" style="color:${ACCENT};word-break:break-all;">${ctaHref}</a>
                </p>`
    : "";

  return `<!-- Shared branded header — keep identical across all Auth emails -->
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background:${PAGE};font-family:Arial,Helvetica,sans-serif;color:${BRAND};">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${PAGE};padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid ${MIST};">
            <tr>
              <td style="background:${BRAND};padding:22px 28px;">
                <img
                  src="${LOGO_URL}"
                  alt="Peters &amp; May"
                  width="160"
                  style="display:block;max-width:160px;height:auto;border:0;"
                />
                <p style="margin:14px 0 0;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#C5D0DB;">
                  Marketing Hub
                </p>
                <h1 style="margin:8px 0 0;font-size:22px;line-height:1.3;color:#ffffff;font-weight:700;">
                  ${heading}
                </h1>
              </td>
            </tr>
            <tr>
              <td style="background:${ACCENT};height:4px;font-size:4px;line-height:4px;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:28px;color:${BODY};font-size:15px;">
                ${paras}
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 0;">
                  <tr>
                    <td style="border-radius:6px;background:${ACCENT};">
                      <a
                        href="${ctaHref}"
                        style="display:inline-block;padding:12px 20px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;"
                      >
                        ${ctaLabel}
                      </a>
                    </td>
                  </tr>
                </table>
                ${afterCtaHtml}
                ${fallback}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 22px;border-top:1px solid ${MIST};background:#FAFBFC;">
                <p style="margin:0;font-size:12px;line-height:1.45;color:${MUTED};text-align:center;">
                  Peters &amp; May · Marketing Hub<br />
                  <a href="${SITE_URL}" style="color:${BRAND};text-decoration:none;">marketing.petersandmay.com</a>
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-size:11px;color:${MUTED};">Peters &amp; May — bespoke logistics</p>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
}
