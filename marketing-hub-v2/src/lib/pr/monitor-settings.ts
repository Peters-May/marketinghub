import type { PrMonitorSettings } from "@/lib/types";

export const DEFAULT_MONITOR_SETTINGS: Omit<PrMonitorSettings, "updated_at"> = {
  digest_emails: "",
};

export function normalizeMonitorSettings(
  input?: Partial<PrMonitorSettings> | null
): PrMonitorSettings {
  return {
    digest_emails: String(input?.digest_emails ?? "").trim(),
    updated_at:
      String(input?.updated_at ?? "").trim() || new Date().toISOString(),
  };
}

/** Split a comma/semicolon/whitespace email list into unique addresses. */
export function parseDigestEmails(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,;\s]+/)) {
    const email = part.trim().toLowerCase();
    if (!email || !email.includes("@") || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}
