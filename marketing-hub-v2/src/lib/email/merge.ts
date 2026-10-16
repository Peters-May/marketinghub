import type { Contact } from "@/lib/types";

export type MergeContext = {
  contact?: Contact | null;
  unsubscribeUrl?: string;
  viewInBrowserUrl?: string;
};

/** Replace {{token}} merge fields in subject/body HTML. */
export function applyEmailMerge(
  template: string,
  ctx: MergeContext
): string {
  const c = ctx.contact;
  const first = (c?.name ?? "").trim().split(/\s+/)[0] ?? "";
  const map: Record<string, string> = {
    name: c?.name ?? "",
    first_name: first,
    organisation: c?.organisation ?? "",
    organization: c?.organisation ?? "",
    role: c?.role ?? "",
    email: c?.email ?? "",
    outlet: c?.outlet ?? "",
    country: c?.country ?? "",
    unsubscribe_url: ctx.unsubscribeUrl ?? "#",
    view_in_browser_url: ctx.viewInBrowserUrl ?? "#",
  };

  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    const k = key.toLowerCase();
    return map[k] ?? "";
  });
}

export function ensureUnsubscribeFooter(html: string): string {
  if (/\{\{\s*unsubscribe_url\s*\}\}/i.test(html)) return html;
  if (/unsubscribe/i.test(html) && /href=/i.test(html)) return html;
  const footer = `
<p style="margin-top:32px;font-size:12px;color:#666;font-family:Arial,sans-serif;">
  <a href="{{unsubscribe_url}}">Unsubscribe</a> from Peters &amp; May marketing emails.
</p>`;
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${footer}</body>`);
  }
  return `${html}${footer}`;
}

const VIEW_IN_BROWSER_LINK = `<p style="margin:0 0 16px;padding:0;font-family:Arial,sans-serif;font-size:12px;line-height:1.4;text-align:center;"><a href="{{view_in_browser_url}}" style="color:#007DC5;text-decoration:underline;">View this email in your browser</a></p>`;

/** Place the browser preview above the email card. */
export function ensureViewInBrowserLink(html: string): string {
  if (/\{\{\s*view_in_browser_url\s*\}\}/i.test(html)) return html;
  if (/view this email in your browser/i.test(html)) return html;
  const marker = '<table role="presentation" class="em-container"';
  const at = html.indexOf(marker);
  if (at !== -1) return html.slice(0, at) + VIEW_IN_BROWSER_LINK + html.slice(at);
  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/<body([^>]*)>/i, `<body$1>${VIEW_IN_BROWSER_LINK}`);
  }
  return `${VIEW_IN_BROWSER_LINK}${html}`;
}
