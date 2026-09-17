import type { Contact } from "@/lib/types";
import { plainTextFromHtml } from "@/lib/plain-text";

/** Apply merge fields in pitch subject/body. */
export function applyPitchMerge(
  template: string,
  contact: Pick<
    Contact,
    "name" | "organisation" | "outlet" | "email" | "beat" | "country"
  >
): string {
  const outlet = contact.outlet || contact.organisation || "";
  return template
    .replaceAll("{{name}}", contact.name || "")
    .replaceAll("{{organisation}}", contact.organisation || "")
    .replaceAll("{{outlet}}", outlet)
    .replaceAll("{{email}}", contact.email || "")
    .replaceAll("{{beat}}", contact.beat || "")
    .replaceAll("{{country}}", contact.country || "");
}

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
      .slice(0, 60) || "pitch"
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
