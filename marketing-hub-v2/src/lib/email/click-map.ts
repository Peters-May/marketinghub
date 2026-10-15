/** Match a clicked URL to the same link in the email HTML. */
export function linkKey(raw: string): string {
  const decoded = raw
    .replace(/&amp;/gi, "&")
    .replace(/&#38;/g, "&")
    .trim();
  if (!decoded || isUnsubscribeLink(decoded)) return "";
  try {
    const url = new URL(decoded);
    if (url.protocol === "mailto:") {
      return `mailto:${url.pathname.toLowerCase()}`;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    url.hash = "";
    const path = url.pathname.replace(/\/+$/, "");
    return `${url.protocol}//${url.host.toLowerCase()}${path}${url.search}`;
  } catch {
    return "";
  }
}

export function isUnsubscribeLink(url: string): boolean {
  return /unsubscribe/i.test(url);
}

/**
 * Put a click count at the start of each matching link.
 * Unsubscribe links are left unmarked.
 */
export function annotateClickMap(
  html: string,
  links: { url: string; count: number }[]
): string {
  if (!html || links.length === 0) return html;
  const counts = new Map<string, number>();
  for (const row of links) {
    const key = linkKey(row.url);
    if (!key || row.count <= 0) continue;
    counts.set(key, (counts.get(key) ?? 0) + row.count);
  }
  if (counts.size === 0) return html;

  return html.replace(
    /<a\b([^>]*?)\bhref=(["'])(.*?)\2([^>]*)>/gi,
    (full, before: string, quote: string, href: string, after: string) => {
      const key = linkKey(href);
      const count = key ? counts.get(key) : undefined;
      if (!count) return full;
      const badge = `<span style="display:inline-block;min-width:1.25rem;margin-right:6px;padding:1px 6px;border-radius:999px;background:#007DC5;color:#ffffff;font-family:Arial,sans-serif;font-size:11px;line-height:1.4;font-weight:700;vertical-align:middle;">${count}</span>`;
      return `<a${before}href=${quote}${href}${quote}${after}>${badge}`;
    }
  );
}
