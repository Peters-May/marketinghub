import type { Contact } from "@/lib/types";
import { plainTextFromHtml } from "@/lib/plain-text";

function firstName(full: string): string {
  const part = full.trim().split(/\s+/)[0];
  return part || full.trim();
}

/** Apply merge fields in subject/body. */
export function applyPitchMerge(
  template: string,
  contact: Pick<
    Contact,
    "name" | "organisation" | "outlet" | "email" | "beat" | "country"
  >
): string {
  const outlet = contact.outlet || contact.organisation || "";
  const first = firstName(contact.name || "");
  return template
    .replaceAll("{{name}}", contact.name || "")
    .replaceAll("{{first_name}}", first)
    .replaceAll("{{greeting}}", first ? `Dear ${first}` : "Dear colleague")
    .replaceAll("{{organisation}}", contact.organisation || "")
    .replaceAll("{{outlet}}", outlet)
    .replaceAll("{{email}}", contact.email || "")
    .replaceAll("{{beat}}", contact.beat || "")
    .replaceAll("{{country}}", contact.country || "");
}

export const MERGE_TOKEN_HELP =
  "{{name}}, {{first_name}}, {{greeting}}, {{organisation}}, {{outlet}}, {{email}}, {{beat}}, {{country}}";

function encodeQuotedPrintableUtf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let out = "";
  let lineLen = 0;
  for (const b of bytes) {
    let chunk: string;
    if (
      (b >= 33 && b <= 60) ||
      (b >= 62 && b <= 126) ||
      b === 9 ||
      b === 32
    ) {
      chunk = String.fromCharCode(b);
    } else {
      chunk = `=${b.toString(16).toUpperCase().padStart(2, "0")}`;
    }
    if (lineLen + chunk.length > 75) {
      out += "=\r\n";
      lineLen = 0;
    }
    out += chunk;
    lineLen += chunk.length;
  }
  return out;
}

function toCrcSafeFilename(name: string): string {
  return (
    name
      .replace(/[^\w\s-]+/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "email"
  );
}

export type EmlBuildInput = {
  from?: string;
  to: string[];
  bcc?: string[];
  subject: string;
  body: string;
};

/** Build a simple MIME .eml string for Outlook. */
export function buildEml(input: EmlBuildInput): string {
  const from = input.from?.trim() || "marketing@petersandmay.com";
  const to = input.to.filter(Boolean).join(", ");
  const bcc = (input.bcc ?? []).filter(Boolean).join(", ");
  const plain = plainTextFromHtml(input.body) || input.body;
  const encodedSubject = `=?UTF-8?Q?${encodeQuotedPrintableUtf8(input.subject)}?=`;
  const encodedBody = encodeQuotedPrintableUtf8(plain);

  const lines = [
    `From: ${from}`,
    to ? `To: ${to}` : "To: undetermined",
    bcc ? `Bcc: ${bcc}` : null,
    `Subject: ${encodedSubject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: quoted-printable",
    "X-Unsent: 1",
    "",
    encodedBody,
  ].filter((line) => line !== null) as string[];

  return lines.join("\r\n");
}

export function downloadEmlBlob(filename: string, eml: string) {
  const blob = new Blob([eml], { type: "message/rfc822" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${toCrcSafeFilename(filename)}.eml`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function mailtoHref(to: string, subject: string, body: string): string {
  const plain = plainTextFromHtml(body) || body;
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(plain)}`;
}

/** Whether a contact counts as press (flag or Press tag). */
export function isPressContact(c: Contact): boolean {
  if (c.is_press) return true;
  return (c.tags || []).some((t) => /^press$/i.test(t));
}

/** Marketing list eligibility. */
export function hasMarketingConsent(c: Contact): boolean {
  return c.marketing_consent === true;
}

/** Build recipient CSV for HubSpot list upload. */
export function recipientsToCsv(
  contacts: Contact[],
  opts?: { requireMarketingConsent?: boolean }
): string {
  const rows = contacts.filter((c) => {
    if (!c.email?.trim()) return false;
    if (opts?.requireMarketingConsent && !hasMarketingConsent(c)) return false;
    return true;
  });
  const header = "email,firstname,lastname,company";
  const lines = rows.map((c) => {
    const parts = c.name.trim().split(/\s+/);
    const first = parts[0] || "";
    const last = parts.slice(1).join(" ");
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    return [
      esc(c.email.trim()),
      esc(first),
      esc(last),
      esc(c.organisation || c.outlet || ""),
    ].join(",");
  });
  return [header, ...lines].join("\r\n");
}

export function downloadTextFile(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const DEFAULT_HUBSPOT_URL = "https://app-eu1.hubspot.com/";

export function insertNewsroomLink(body: string, baseUrl = ""): string {
  const link = `${baseUrl.replace(/\/$/, "")}/newsroom`;
  const block = `\n\nRead more in our newsroom: ${link}\n`;
  if (body.includes("/newsroom")) return body;
  return body.trimEnd() + block;
}

export function insertReleaseBlock(
  body: string,
  release: { title: string; caption?: string; id: string },
  baseUrl = ""
): string {
  const url = `${baseUrl.replace(/\/$/, "")}/newsroom`;
  const snippet = (release.caption || "").trim().slice(0, 280);
  const block = [
    "",
    "—",
    release.title,
    snippet,
    `Full release: ${url}`,
    "",
  ].join("\n");
  if (body.includes(release.title)) return body;
  return body.trimEnd() + "\n" + block;
}
