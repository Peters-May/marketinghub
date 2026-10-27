import { cssValue } from "@/lib/email/css-value";
import type { Contact } from "@/lib/types";

export type MergeContext = {
  contact?: Contact | null;
  unsubscribeUrl?: string;
  preferencesUrl?: string;
  viewInBrowserUrl?: string;
};

export type MergeOptions = {
  /**
   * "html" (default) escapes contact values so a name such as
   * `<img onerror=…>` stays text. Use "text" for subject lines.
   */
  format?: "html" | "text";
};

export type EmailMergeField = {
  token: string;
  label: string;
  /** Link tokens belong in the body. Subject and preview use contact fields. */
  kind: "contact" | "link";
};

/** Variables a marketer can drop into a subject, preview, or text block. */
export const EMAIL_MERGE_FIELDS: readonly EmailMergeField[] = [
  { token: "{{first_name}}", label: "First name", kind: "contact" },
  { token: "{{last_name}}", label: "Last name", kind: "contact" },
  { token: "{{name}}", label: "Full name", kind: "contact" },
  { token: "{{greeting}}", label: "Greeting", kind: "contact" },
  { token: "{{organisation}}", label: "Organisation", kind: "contact" },
  { token: "{{role}}", label: "Role", kind: "contact" },
  { token: "{{email}}", label: "Email", kind: "contact" },
  { token: "{{outlet}}", label: "Outlet", kind: "contact" },
  { token: "{{country}}", label: "Country", kind: "contact" },
  { token: "{{unsubscribe_url}}", label: "Unsubscribe link", kind: "link" },
  { token: "{{preferences_url}}", label: "Preferences link", kind: "link" },
  { token: "{{view_in_browser_url}}", label: "View in browser link", kind: "link" },
];

export function splitContactName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return {
    first: parts[0] ?? "",
    last: parts.slice(1).join(" "),
  };
}

/** Replace {{token}} merge fields in subject/body HTML. */
export function applyEmailMerge(
  template: string,
  ctx: MergeContext,
  opts?: MergeOptions
): string {
  const html = opts?.format !== "text";
  const c = ctx.contact;
  const { first, last } = splitContactName(c?.name ?? "");
  const map: Record<string, string> = {
    name: c?.name ?? "",
    first_name: first,
    last_name: last,
    greeting: first ? `Dear ${first}` : "Dear colleague",
    organisation: c?.organisation ?? "",
    organization: c?.organisation ?? "",
    role: c?.role ?? "",
    email: c?.email ?? "",
    outlet: c?.outlet ?? "",
    country: c?.country ?? "",
    unsubscribe_url: ctx.unsubscribeUrl ?? "#",
    preferences_url:
      ctx.preferencesUrl ?? ctx.unsubscribeUrl ?? "#",
    view_in_browser_url: ctx.viewInBrowserUrl ?? "#",
  };

  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    const k = key.toLowerCase();
    const value = map[k] ?? "";
    return html ? escapeMergeValue(value) : value;
  });
}

export function ensureUnsubscribeFooter(
  html: string,
  opts?: {
    showUnsubscribe?: boolean;
    showPreferences?: boolean;
    unsubscribeLabel?: string;
    preferencesLabel?: string;
    linkColor?: string;
  }
): string {
  if (
    /\{\{\s*unsubscribe_url\s*\}\}/i.test(html) ||
    /\{\{\s*preferences_url\s*\}\}/i.test(html)
  ) {
    return html;
  }
  if (/unsubscribe/i.test(html) && /href=/i.test(html)) return html;
  const showUnsubscribe = opts?.showUnsubscribe !== false;
  const showPreferences = opts?.showPreferences === true;
  if (!showUnsubscribe && !showPreferences) return html;
  const color = cssValue(opts?.linkColor, "#007DC5");
  const unsubLabel = opts?.unsubscribeLabel?.trim() || "Unsubscribe";
  const prefsLabel = opts?.preferencesLabel?.trim() || "Manage preferences";
  const parts: string[] = [];
  if (showUnsubscribe) {
    parts.push(
      `<a href="{{unsubscribe_url}}" style="color:${color};">${escapeFooterLabel(unsubLabel)}</a>`
    );
  }
  if (showPreferences) {
    parts.push(
      `<a href="{{preferences_url}}" style="color:${color};">${escapeFooterLabel(prefsLabel)}</a>`
    );
  }
  const footer = `
<p style="margin-top:32px;font-size:12px;color:#666;font-family:Arial,sans-serif;">
  ${parts.join(" &nbsp;|&nbsp; ")}${
    showUnsubscribe
      ? " from Peters &amp; May marketing emails."
      : ""
  }
</p>`;
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${footer}</body>`);
  }
  return `${html}${footer}`;
}

function escapeMergeValue(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeFooterLabel(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
