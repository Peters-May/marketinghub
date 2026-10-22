import { Resend } from "resend";
import {
  AI_KEY_DEFAULT_LIFETIME_DAYS,
  AI_KEY_NOTICE_DAYS,
  AI_KEY_NOTIFY_EMAIL,
  AI_KEY_TASK_ID,
  addUtcDays,
  aiKeyHealth,
  assertOpenAiKey,
  daysUntilDate,
  isIsoDate,
  keyHint,
  nextAiKeyNotice,
  normalizeAiKeySettings,
  utcToday,
  type AiKeyPublicStatus,
  type AiKeySource,
} from "@/lib/ai/ai-key-status";
import { isClosedTaskStatus } from "@/lib/data/collections";
import { listHubUsers } from "@/lib/data/repos";
import {
  decryptCredentialSecret,
  encryptCredentialSecret,
} from "@/lib/security/credentials-crypto";
import { readStore, updateStore } from "@/lib/store/local";
import type { AiKeyNotice, AiKeySettings, HubTask } from "@/lib/types";

export type { AiKeyPublicStatus, AiKeySource };

function environmentApiKey(): string | null {
  const value =
    process.env.OPENAI_API_KEY?.trim() ||
    process.env.AI_GATEWAY_API_KEY?.trim() ||
    process.env.VERCEL_AI_GATEWAY_API_KEY?.trim() ||
    "";
  return value || null;
}

export async function getAiKeySettings(): Promise<AiKeySettings> {
  const store = await readStore();
  return normalizeAiKeySettings(store.ai_settings);
}

export async function resolveHubOpenAIApiKey(): Promise<{
  key: string | null;
  source: AiKeySource;
  settings: AiKeySettings;
}> {
  const settings = await getAiKeySettings();
  const stored = settings.api_key
    ? decryptCredentialSecret(settings.api_key).trim()
    : "";
  if (stored) {
    return { key: stored, source: "admin", settings };
  }
  const env = environmentApiKey();
  if (env) return { key: env, source: "environment", settings };
  return { key: null, source: "none", settings };
}

export async function getAiKeyPublicStatus(
  now = new Date()
): Promise<AiKeyPublicStatus> {
  const resolved = await resolveHubOpenAIApiKey();
  const days = resolved.settings.expires_on
    ? daysUntilDate(resolved.settings.expires_on, utcToday(now))
    : null;
  const hint =
    resolved.source === "admin"
      ? resolved.settings.key_hint || keyHint(resolved.key ?? "")
      : resolved.source === "environment"
        ? keyHint(resolved.key ?? "")
        : "";
  return {
    configured: Boolean(resolved.key),
    source: resolved.source,
    key_hint: hint,
    expires_on: resolved.settings.expires_on,
    days_remaining: days,
    status: aiKeyHealth(days, Boolean(resolved.key)),
    updated_at: resolved.settings.updated_at,
    updated_by: resolved.settings.updated_by,
  };
}

export async function saveAiKey(input: {
  apiKey?: string;
  expiresOn?: string;
  updatedBy?: string;
}): Promise<AiKeyPublicStatus> {
  const current = await getAiKeySettings();
  const hasNewKey = Boolean(input.apiKey?.trim());
  const nextSecret = hasNewKey ? assertOpenAiKey(input.apiKey ?? "") : "";
  let expiresOn = current.expires_on;
  if (input.expiresOn?.trim()) {
    const requested = input.expiresOn.trim();
    if (!isIsoDate(requested)) {
      throw new Error("Expiry must be a calendar date.");
    }
    expiresOn = requested;
  } else if (hasNewKey && !expiresOn) {
    expiresOn = addUtcDays(utcToday(), AI_KEY_DEFAULT_LIFETIME_DAYS);
  }
  if (!hasNewKey && !current.api_key && !environmentApiKey()) {
    throw new Error("Paste an OpenAI API key.");
  }
  if (!expiresOn) {
    throw new Error("Set the date the key expires.");
  }

  const keyChanged = hasNewKey;
  const expiryChanged = expiresOn !== current.expires_on;
  await updateStore((store) => {
    const prev = normalizeAiKeySettings(store.ai_settings);
    store.ai_settings = normalizeAiKeySettings({
      ...prev,
      api_key: keyChanged ? encryptCredentialSecret(nextSecret) : prev.api_key,
      key_hint: keyChanged ? keyHint(nextSecret) : prev.key_hint,
      expires_on: expiresOn,
      notices_sent: keyChanged || expiryChanged ? [] : prev.notices_sent,
      updated_at: new Date().toISOString(),
      updated_by: (input.updatedBy ?? "").trim().slice(0, 120),
    });
    store.tasks = syncReminderTask(store.tasks, store.ai_settings);
  });
  return getAiKeyPublicStatus();
}

function reminderCopy(days: number, expiresOn: string): { title: string; details: string } {
  const when =
    days < 0
      ? `It expired on ${expiresOn}.`
      : days === 0
        ? "It expires today."
        : `It expires on ${expiresOn} (${days} day${days === 1 ? "" : "s"} left).`;
  return {
    title:
      days <= 0
        ? "Replace the OpenAI API key — it has expired"
        : `Replace the OpenAI API key — ${days} day${days === 1 ? "" : "s"} left`,
    details: `${when} Update it under Admin → AI key. OpenAI project keys last 90 days.`,
  };
}

function syncReminderTask(
  tasks: HubTask[] | undefined,
  settings: AiKeySettings
): HubTask[] {
  const list = tasks ?? [];
  const days = settings.expires_on ? daysUntilDate(settings.expires_on) : null;
  const index = list.findIndex((task) => task.id === AI_KEY_TASK_ID);
  const needsTask =
    Boolean(settings.api_key || environmentApiKey()) &&
    days !== null &&
    days <= 14;
  const now = new Date().toISOString();

  if (!needsTask) {
    if (index >= 0 && !isClosedTaskStatus(list[index].status)) {
      list[index] = { ...list[index], status: "done", updated_at: now };
    }
    return list;
  }

  const copy = reminderCopy(days, settings.expires_on);
  if (index >= 0) {
    list[index] = {
      ...list[index],
      title: copy.title,
      details: copy.details,
      due_date: settings.expires_on,
      status: "todo",
      updated_at: now,
    };
    return list;
  }

  list.push({
    id: AI_KEY_TASK_ID,
    title: copy.title,
    details: copy.details,
    start_date: utcToday(),
    due_date: settings.expires_on,
    category: "Admin",
    status: "todo",
    owner: "Marketing",
    related_type: "",
    related_id: null,
    created_at: now,
    updated_at: now,
  });
  return list;
}

function appOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
}

function uniqueEmails(emails: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of emails) {
    const trimmed = (raw ?? "").trim();
    const key = trimmed.toLowerCase();
    if (!trimmed.includes("@") || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

async function notifyRecipients(): Promise<string[]> {
  const users = await listHubUsers().catch(() => []);
  return uniqueEmails([
    ...users.filter((user) => user.role === "admin").map((user) => user.email),
    process.env.MARKETING_ALERT_EMAIL,
    process.env.CHAT_NOTIFY_EMAIL,
    AI_KEY_NOTIFY_EMAIL,
  ]);
}

function noticeSubject(days: number): string {
  if (days < 0) return "OpenAI API key has expired";
  if (days === 0) return "OpenAI API key expires today";
  return `OpenAI API key expires in ${days} day${days === 1 ? "" : "s"}`;
}

async function sendExpiryEmail(input: {
  to: string[];
  days: number;
  expiresOn: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey || input.to.length === 0) return false;
  const from =
    process.env.RESEND_FROM_EMAIL?.trim() || "marketing@petersandmay.com";
  const origin = appOrigin();
  const href = origin ? `${origin}/app/admin/ai` : "/app/admin/ai";
  const subject = noticeSubject(input.days);
  const when =
    input.days < 0
      ? `The OpenAI API key expired on ${input.expiresOn}.`
      : input.days === 0
        ? `The OpenAI API key expires today (${input.expiresOn}).`
        : `The OpenAI API key expires on ${input.expiresOn}. ${input.days} day${input.days === 1 ? "" : "s"} remain.`;
  const html = `<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.5; color: #0B2545; max-width: 560px; margin: 0 auto; padding: 24px;">
  <p><strong>${subject}</strong></p>
  <p>${when}</p>
  <p>Replace it in Marketing Hub under Admin → AI key. A new OpenAI project key lasts 90 days — set the expiry date when you save it.</p>
  <p><a href="${href}" style="color: #007DC5;">Open AI key settings</a></p>
</body>
</html>`;
  const text = `${subject}\n\n${when}\n\nReplace it in Marketing Hub under Admin → AI key.\n${href}`;
  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: input.to,
      subject,
      html,
      text,
    });
    if (error) {
      console.error("[ai-key] reminder email failed", error.message);
      return false;
    }
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Email failed";
    console.error("[ai-key] reminder email failed", message);
    return false;
  }
}

export async function notifyAiKeyExpiry(): Promise<{
  days_remaining: number | null;
  notice: AiKeyNotice | null;
  emailed: boolean;
  task: boolean;
}> {
  const settings = await getAiKeySettings();
  const days = settings.expires_on ? daysUntilDate(settings.expires_on) : null;
  const notice = nextAiKeyNotice(days, settings.notices_sent);
  const needsTask = days !== null && days <= 14;
  let emailed = false;

  if (notice && days !== null && settings.expires_on) {
    const recipients = await notifyRecipients();
    emailed = await sendExpiryEmail({
      to: recipients,
      days,
      expiresOn: settings.expires_on,
    });
  }

  if (notice || needsTask) {
    await updateStore((store) => {
      const current = normalizeAiKeySettings(store.ai_settings);
      const currentDays = current.expires_on
        ? daysUntilDate(current.expires_on)
        : null;
      const due = nextAiKeyNotice(currentDays, current.notices_sent);
      if (due && emailed) {
        const marked = new Set<AiKeyNotice>(current.notices_sent);
        for (const day of AI_KEY_NOTICE_DAYS) {
          if (currentDays !== null && currentDays <= day) {
            marked.add(String(day) as AiKeyNotice);
          }
        }
        current.notices_sent = AI_KEY_NOTICE_DAYS.map(String).filter((day) =>
          marked.has(day as AiKeyNotice)
        ) as AiKeyNotice[];
      }
      store.ai_settings = current;
      store.tasks = syncReminderTask(store.tasks, current);
    });
  }

  return {
    days_remaining: days,
    notice: emailed ? notice : null,
    emailed,
    task: needsTask,
  };
}
