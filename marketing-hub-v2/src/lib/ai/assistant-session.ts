import type { AssistantAttachment, AssistantMode } from "@/lib/ai/assistant-shared";
import { isAssistantMode } from "@/lib/ai/assistant-shared";

export const ASSISTANT_SESSION_KEY = "hub-assistant-session-v1";
export const ASSISTANT_SESSION_MESSAGE_CAP = 20;

export type AssistantSessionMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  commandText?: string | null;
  reviewId?: string | null;
  rating?: "up" | "down" | null;
};

export type AssistantSessionDraft =
  | {
      kind: "email";
      subject: string;
      preview: string;
      heading: string;
      html: string;
      buttonLabel: string;
    }
  | {
      kind: "social";
      caption: string;
      channels: string[];
      notes: string;
      suggestedCommand?: string;
    }
  | { kind: "rewrite"; text: string }
  | {
      kind: "summarise";
      summary: string;
      keyPoints: string[];
      openQuestions: string[];
    };

export type AssistantSessionPreviewAction = {
  summary: string;
  line: string;
  kind: string;
  checked: boolean;
};

export type AssistantSessionCommandPreview = {
  summary: string;
  verb: "Add" | "Update" | "Link";
  href: string;
  text: string;
  items: string[];
  actions: AssistantSessionPreviewAction[];
  skipped: string[];
};

export type AssistantSessionState = {
  mode: AssistantMode;
  composer: string;
  messages: AssistantSessionMessage[];
  attachments: AssistantAttachment[];
  draft: AssistantSessionDraft | null;
  pendingCommand: string | null;
  commandPreview: AssistantSessionCommandPreview | null;
};

function asString(value: unknown, max = 12000): string {
  if (typeof value !== "string") return "";
  return value.slice(0, max);
}

function parseAttachments(raw: unknown): AssistantAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: AssistantAttachment[] = [];
  for (const item of raw.slice(0, 8)) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const name = asString(rec.name, 200).trim();
    const url = asString(rec.url, 2000).trim();
    const mime = asString(rec.mime, 120).trim();
    if (!name || !url || !mime) continue;
    out.push({ name, url, mime });
  }
  return out;
}

function parseMessages(raw: unknown): AssistantSessionMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: AssistantSessionMessage[] = [];
  for (const item of raw.slice(-ASSISTANT_SESSION_MESSAGE_CAP)) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const role =
      rec.role === "assistant"
        ? "assistant"
        : rec.role === "user"
          ? "user"
          : null;
    const id = asString(rec.id, 80).trim() || `${Date.now()}-${out.length}`;
    const content = asString(rec.content, 12000);
    if (!role || !content) continue;
    const commandText =
      typeof rec.commandText === "string" ? rec.commandText.slice(0, 8000) : null;
    const reviewId =
      typeof rec.reviewId === "string" ? rec.reviewId.slice(0, 80) : null;
    const rating =
      rec.rating === "up" || rec.rating === "down" ? rec.rating : null;
    out.push({
      id,
      role,
      content,
      commandText,
      reviewId,
      rating,
    });
  }
  return out;
}

function parseDraft(raw: unknown): AssistantSessionDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (rec.kind === "email") {
    return {
      kind: "email",
      subject: asString(rec.subject, 500),
      preview: asString(rec.preview, 500),
      heading: asString(rec.heading, 500),
      html: asString(rec.html, 20000),
      buttonLabel: asString(rec.buttonLabel, 120) || "Read more",
    };
  }
  if (rec.kind === "social") {
    return {
      kind: "social",
      caption: asString(rec.caption, 8000),
      channels: Array.isArray(rec.channels)
        ? rec.channels
            .filter((c): c is string => typeof c === "string")
            .map((c) => c.slice(0, 40))
            .slice(0, 8)
        : [],
      notes: asString(rec.notes, 2000),
      suggestedCommand:
        typeof rec.suggestedCommand === "string"
          ? rec.suggestedCommand.slice(0, 4000)
          : undefined,
    };
  }
  if (rec.kind === "rewrite") {
    return { kind: "rewrite", text: asString(rec.text, 12000) };
  }
  if (rec.kind === "summarise") {
    return {
      kind: "summarise",
      summary: asString(rec.summary, 8000),
      keyPoints: Array.isArray(rec.keyPoints)
        ? rec.keyPoints
            .filter((p): p is string => typeof p === "string")
            .map((p) => p.slice(0, 500))
            .slice(0, 20)
        : [],
      openQuestions: Array.isArray(rec.openQuestions)
        ? rec.openQuestions
            .filter((q): q is string => typeof q === "string")
            .map((q) => q.slice(0, 500))
            .slice(0, 20)
        : [],
    };
  }
  return null;
}

function parseCommandPreview(
  raw: unknown
): AssistantSessionCommandPreview | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const verb =
    rec.verb === "Add" || rec.verb === "Update" || rec.verb === "Link"
      ? rec.verb
      : null;
  const summary = asString(rec.summary, 1000).trim();
  const href = asString(rec.href, 500).trim();
  const text = asString(rec.text, 8000).trim();
  if (!verb || !summary || !text) return null;
  const actions: AssistantSessionPreviewAction[] = [];
  if (Array.isArray(rec.actions)) {
    for (const action of rec.actions.slice(0, 40)) {
      if (!action || typeof action !== "object") continue;
      const row = action as Record<string, unknown>;
      const actionSummary = asString(row.summary, 500).trim();
      const line = asString(row.line, 800).trim() || actionSummary;
      if (!actionSummary) continue;
      actions.push({
        summary: actionSummary,
        line,
        kind: asString(row.kind, 80),
        checked: row.checked !== false,
      });
    }
  }
  return {
    summary,
    verb,
    href,
    text,
    items: Array.isArray(rec.items)
      ? rec.items
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.slice(0, 500))
          .slice(0, 40)
      : [],
    actions,
    skipped: Array.isArray(rec.skipped)
      ? rec.skipped
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.slice(0, 500))
          .slice(0, 40)
      : [],
  };
}

export function emptyAssistantSession(): AssistantSessionState {
  return {
    mode: "chat",
    composer: "",
    messages: [],
    attachments: [],
    draft: null,
    pendingCommand: null,
    commandPreview: null,
  };
}

export function readAssistantSession(): AssistantSessionState {
  if (typeof window === "undefined") return emptyAssistantSession();
  try {
    const raw = window.sessionStorage.getItem(ASSISTANT_SESSION_KEY);
    if (!raw) return emptyAssistantSession();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      mode: isAssistantMode(parsed.mode) ? parsed.mode : "chat",
      composer: asString(parsed.composer, 8000),
      messages: parseMessages(parsed.messages),
      attachments: parseAttachments(parsed.attachments),
      draft: parseDraft(parsed.draft),
      pendingCommand:
        typeof parsed.pendingCommand === "string"
          ? parsed.pendingCommand.slice(0, 8000)
          : null,
      commandPreview: parseCommandPreview(parsed.commandPreview),
    };
  } catch {
    return emptyAssistantSession();
  }
}

export function writeAssistantSession(state: AssistantSessionState): void {
  if (typeof window === "undefined") return;
  try {
    const payload: AssistantSessionState = {
      mode: state.mode,
      composer: state.composer.slice(0, 8000),
      messages: state.messages.slice(-ASSISTANT_SESSION_MESSAGE_CAP),
      attachments: state.attachments.slice(0, 8),
      draft: state.draft,
      pendingCommand: state.pendingCommand
        ? state.pendingCommand.slice(0, 8000)
        : null,
      commandPreview: state.commandPreview,
    };
    window.sessionStorage.setItem(ASSISTANT_SESSION_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearAssistantSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(ASSISTANT_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
