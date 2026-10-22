import type { AiKeyNotice, AiKeySettings } from "@/lib/types";

export const AI_KEY_DEFAULT_LIFETIME_DAYS = 90;
export const AI_KEY_NOTICE_DAYS = [14, 7, 1, 0] as const;
export const AI_KEY_TASK_ID = "tsk_openai_key_renewal";
export const AI_KEY_NOTIFY_EMAIL = "marketing@petersandmay.com";

const NOTICE_SET = new Set<string>(AI_KEY_NOTICE_DAYS.map(String));

export type AiKeySource = "admin" | "environment" | "none";
export type AiKeyHealth = "ok" | "soon" | "urgent" | "expired" | "missing";

export type AiKeyPublicStatus = {
  configured: boolean;
  source: AiKeySource;
  key_hint: string;
  expires_on: string;
  days_remaining: number | null;
  status: AiKeyHealth;
  updated_at: string;
  updated_by: string;
};

export function emptyAiKeySettings(now = new Date().toISOString()): AiKeySettings {
  return {
    api_key: "",
    key_hint: "",
    expires_on: "",
    notices_sent: [],
    updated_at: now,
    updated_by: "",
  };
}

export function utcToday(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function addUtcDays(isoDate: string, days: number): string {
  const ms = Date.parse(`${isoDate}T00:00:00.000Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed)) return false;
  return new Date(parsed).toISOString().slice(0, 10) === value;
}

export function daysUntilDate(
  expiresOn: string,
  today = utcToday()
): number | null {
  if (!isIsoDate(expiresOn) || !isIsoDate(today)) return null;
  const start = Date.parse(`${today}T00:00:00.000Z`);
  const end = Date.parse(`${expiresOn}T00:00:00.000Z`);
  return Math.round((end - start) / 86_400_000);
}

export function keyHint(secret: string): string {
  const trimmed = secret.trim();
  if (trimmed.length < 8) return "";
  return trimmed.slice(-4);
}

export function aiKeyHealth(
  days: number | null,
  configured: boolean
): AiKeyHealth {
  if (!configured) return "missing";
  if (days === null) return "ok";
  if (days <= 0) return "expired";
  if (days <= 7) return "urgent";
  if (days <= 14) return "soon";
  return "ok";
}

export function nextAiKeyNotice(
  days: number | null,
  sent: readonly string[]
): AiKeyNotice | null {
  if (days === null) return null;
  const due = AI_KEY_NOTICE_DAYS.filter((day) => days <= day).map(
    (day) => String(day) as AiKeyNotice
  );
  const unsent = due.filter((day) => !sent.includes(day));
  if (!unsent.length) return null;
  return unsent.reduce((tightest, day) =>
    Number(day) < Number(tightest) ? day : tightest
  );
}

function noticesFrom(input: unknown): AiKeyNotice[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<AiKeyNotice>();
  for (const item of input) {
    const value = String(item);
    if (!NOTICE_SET.has(value)) continue;
    seen.add(value as AiKeyNotice);
  }
  return AI_KEY_NOTICE_DAYS.map(String).filter((day) =>
    seen.has(day as AiKeyNotice)
  ) as AiKeyNotice[];
}

export function normalizeAiKeySettings(
  input?: Partial<AiKeySettings> | null
): AiKeySettings {
  const base = emptyAiKeySettings();
  const expires = String(input?.expires_on ?? "").trim();
  return {
    api_key: String(input?.api_key ?? ""),
    key_hint: String(input?.key_hint ?? "")
      .replace(/\s/g, "")
      .slice(-4),
    expires_on: isIsoDate(expires) ? expires : "",
    notices_sent: noticesFrom(input?.notices_sent),
    updated_at: input?.updated_at || base.updated_at,
    updated_by: String(input?.updated_by ?? "").trim().slice(0, 120),
  };
}

export function assertOpenAiKey(secret: string): string {
  const trimmed = secret.trim();
  if (!trimmed.startsWith("sk-") || trimmed.length < 20 || /\s/.test(trimmed)) {
    throw new Error("Paste a full OpenAI API key.");
  }
  return trimmed;
}
