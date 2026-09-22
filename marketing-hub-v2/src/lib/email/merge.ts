import type { Contact } from "@/lib/types";

export type MergeContext = {
  contact?: Contact | null;
  unsubscribeUrl?: string;
};

/** Replace {{token}} merge fields in subject/body HTML. */
export function applyEmailMerge(
  template: string,
  ctx: MergeContext
): string {
  const c = ctx.contact;
  const map: Record<string, string> = {
    name: c?.name ?? "",
    organisation: c?.organisation ?? "",
    organization: c?.organisation ?? "",
    role: c?.role ?? "",
    email: c?.email ?? "",
    outlet: c?.outlet ?? "",
    country: c?.country ?? "",
    unsubscribe_url: ctx.unsubscribeUrl ?? "#",
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
