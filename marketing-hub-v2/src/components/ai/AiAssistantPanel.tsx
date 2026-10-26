"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  Copy,
  FileUp,
  Loader2,
  PanelRightClose,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  extractHubCommand,
  isHubRunConfirmation,
  type AssistantAttachment,
  type AssistantMode,
} from "@/lib/ai/assistant-shared";
import { notifyHubDataChanged, type HubDataArea } from "@/lib/command/refresh";
import { uploadAssetDirect } from "@/lib/upload/client-upload";
import {
  isAllowedUpload,
  MAX_UPLOAD_BYTES,
  UPLOAD_ACCEPT,
} from "@/lib/upload/allowed-types";
import { cn } from "@/lib/utils";

/** Keep in step with the dock width class on the assistant aside. */
export const ASSISTANT_DOCK_WIDTH = "22rem";

type ChatRole = "user" | "assistant";

type ThreadMessage = {
  id: string;
  role: ChatRole;
  content: string;
  commandText?: string | null;
};

type DraftResult =
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

type CommandPreview = {
  summary: string;
  verb: "Add" | "Update";
  href: string;
  text: string;
  items: string[];
  skipped: string[];
};

const MODE_OPTIONS: { id: AssistantMode; label: string }[] = [
  { id: "chat", label: "Chat" },
  { id: "draft_email", label: "Draft email" },
  { id: "draft_social", label: "Draft social" },
  { id: "rewrite", label: "Rewrite" },
  { id: "summarise", label: "Summarise" },
];

const MAX_MB = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function mimeFromFile(file: File) {
  return file.type || "application/octet-stream";
}

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

function draftPlainText(draft: DraftResult): string {
  if (draft.kind === "email") {
    return [
      `Subject: ${draft.subject}`,
      `Preview: ${draft.preview}`,
      `Heading: ${draft.heading}`,
      "",
      draft.html.replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, "").trim(),
      "",
      `Button: ${draft.buttonLabel}`,
    ].join("\n");
  }
  if (draft.kind === "social") {
    return [
      draft.caption,
      "",
      `Channels: ${draft.channels.join(", ")}`,
      draft.notes ? `Notes: ${draft.notes}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (draft.kind === "rewrite") return draft.text;
  return [
    draft.summary,
    "",
    ...(draft.keyPoints.length
      ? ["Key points:", ...draft.keyPoints.map((p) => `• ${p}`)]
      : []),
    ...(draft.openQuestions.length
      ? ["", "Open questions:", ...draft.openQuestions.map((q) => `• ${q}`)]
      : []),
  ].join("\n");
}

export function AiAssistantPanel({
  open,
  onClose,
  onOpen,
  readOnly = false,
  className,
}: {
  open: boolean;
  onClose: () => void;
  onOpen: () => void;
  readOnly?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const panelRef = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<AssistantMode>("chat");
  const [composer, setComposer] = useState("");
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [attachments, setAttachments] = useState<AssistantAttachment[]>([]);
  const [draft, setDraft] = useState<DraftResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [fullPage, setFullPage] = useState(false);
  const [commandPreview, setCommandPreview] = useState<CommandPreview | null>(
    null
  );
  const [commandNotice, setCommandNotice] = useState<{
    message: string;
    href?: string;
  } | null>(null);
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);
  const confirmingRef = useRef(false);

  const clearSession = useCallback(() => {
    setMessages([]);
    setDraft(null);
    setAttachments([]);
    setComposer("");
    setError(null);
    setCommandPreview(null);
    setCommandNotice(null);
    setPendingCommand(null);
    setCopied(false);
  }, []);

  async function onPickFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of files.slice(0, 4)) {
        if (!isAllowedUpload(file.name, file.type)) {
          setError(`“${file.name}” is not an allowed file type.`);
          continue;
        }
        const uploaded = await uploadAssetDirect(file);
        setAttachments((prev) => [
          ...prev,
          {
            name: uploaded.name || file.name,
            url: uploaded.url,
            mime: mimeFromFile(file),
          },
        ]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function previewCommand(text: string) {
    setCommandNotice(null);
    setBusy(true);
    try {
      const res = await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, confirm: false }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setCommandPreview(null);
        setCommandNotice({
          message: data.error || "The hub could not read that command.",
        });
        return;
      }
      if (data.preview) {
        setCommandPreview({
          summary: data.preview.summary,
          verb: data.preview.verb,
          href: data.preview.href,
          text,
          items: Array.isArray(data.preview.items) ? data.preview.items : [],
          skipped: Array.isArray(data.preview.skipped)
            ? data.preview.skipped
            : [],
        });
      }
    } catch {
      setCommandNotice({ message: "The hub could not preview that command." });
    } finally {
      setBusy(false);
    }
  }

  async function confirmCommand(text?: string | null) {
    if (readOnly) return;
    const commandText = (text ?? pendingCommand ?? commandPreview?.text)?.trim();
    if (!commandText || confirmingRef.current) return;
    confirmingRef.current = true;
    setBusy(true);
    setCommandNotice(null);
    try {
      const res = await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: commandText, confirm: true }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setCommandNotice({
          message: data.error || "The hub could not save that.",
        });
        return;
      }
      if (data.done) {
        setCommandPreview((current) =>
          current?.text === commandText ? null : current
        );
        setPendingCommand((current) =>
          current === commandText ? null : current
        );
        setCommandNotice({
          message: data.done.message,
          href: data.done.href,
        });
        const areas = Array.isArray(data.done.areas)
          ? data.done.areas
          : data.done.area
            ? [data.done.area]
            : [];
        for (const area of areas) {
          notifyHubDataChanged(area as HubDataArea);
        }
        setMessages((prev) => [
          ...prev.map((message) =>
            message.commandText === commandText
              ? { ...message, commandText: null }
              : message
          ),
          {
            id: newId(),
            role: "assistant",
            content: String(data.done.message),
          },
        ]);
        router.refresh();
      }
    } catch {
      setCommandNotice({ message: "The hub could not save that. Try again." });
    } finally {
      confirmingRef.current = false;
      setBusy(false);
    }
  }

  async function submitChat() {
    const text = composer.trim();
    if (!text || busy) return;
    if (!readOnly && pendingCommand && isHubRunConfirmation(text)) {
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: "user", content: text },
      ]);
      setComposer("");
      setError(null);
      await confirmCommand(pendingCommand);
      return;
    }
    const userMsg: ThreadMessage = {
      id: newId(),
      role: "user",
      content: text,
    };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setComposer("");
    setBusy(true);
    setError(null);
    setCommandPreview(null);
    setCommandNotice(null);
    setPendingCommand(null);

    const assistantId = newId();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "…" },
    ]);

    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "chat",
          messages: nextMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          attachments,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        setError(
          typeof data.error === "string"
            ? data.error
            : "The assistant could not respond."
        );
        return;
      }

      const raw = typeof data.reply === "string" ? data.reply : "";
      const extracted = extractHubCommand(raw);
      const commandText = readOnly ? null : extracted.commandText;
      const displayText = readOnly ? extracted.displayText || raw.trim() : extracted.displayText;
      if (!displayText && !commandText) {
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        setError(
          "The assistant returned an empty reply. If this keeps happening, check OpenAI billing credits."
        );
        return;
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: displayText || "Proposed action ready. Press Confirm, or type do it.",
                commandText,
              }
            : m
        )
      );
      if (commandText) {
        setPendingCommand(commandText);
        await previewCommand(commandText);
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      setError("The assistant could not respond. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitDraftMode() {
    const text = composer.trim();
    if ((!text && !attachments.length) || busy) return;
    setBusy(true);
    setError(null);
    setDraft(null);
    setCommandPreview(null);
    setCommandNotice(null);
    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          brief: text,
          attachments,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "The assistant could not respond.");
        return;
      }

      if (mode === "draft_email" && data.draft) {
        setDraft({ kind: "email", ...data.draft });
      } else if (mode === "draft_social" && data.draft) {
        setDraft({ kind: "social", ...data.draft });
        if (data.draft.suggestedCommand) {
          const command = String(data.draft.suggestedCommand);
          setPendingCommand(command);
          await previewCommand(command);
        }
      } else if (mode === "rewrite" && data.draft?.text) {
        setDraft({ kind: "rewrite", text: data.draft.text });
      } else if (mode === "summarise" && data.draft) {
        setDraft({ kind: "summarise", ...data.draft });
      }

      setMessages((prev) => [
        ...prev,
        { id: newId(), role: "user", content: text || "(attachments only)" },
        {
          id: newId(),
          role: "assistant",
          content:
            mode === "draft_email"
              ? "Draft email ready — copy or open Email to continue."
              : mode === "draft_social"
                ? "Draft social post ready."
                : mode === "rewrite"
                  ? "Rewrite ready."
                  : "Summary ready.",
        },
      ]);
    } catch {
      setError("The assistant could not respond. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (mode === "chat") void submitChat();
    else void submitDraftMode();
  }

  async function onCopyDraft() {
    if (!draft) return;
    try {
      await copyText(draftPlainText(draft));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to the clipboard.");
    }
  }

  useEffect(() => {
    const sheet = window.matchMedia("(max-width: 767px)");
    const apply = () => setFullPage(sheet.matches);
    apply();
    sheet.addEventListener("change", apply);
    return () => sheet.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!open) return;
    const sheet = window.matchMedia("(max-width: 1023px)");
    const previousOverflow = document.body.style.overflow;
    const lock = () => {
      document.body.style.overflow = sheet.matches ? "hidden" : previousOverflow;
    };
    lock();
    if (sheet.matches) panelRef.current?.focus();
    sheet.addEventListener("change", lock);
    return () => {
      sheet.removeEventListener("change", lock);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const sheet = window.matchMedia("(max-width: 1023px)").matches;
      if (!sheet && !panelRef.current?.contains(document.activeElement)) return;
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const placeholder =
    mode === "chat"
      ? "Ask anything, or ask to add a task / event / post…"
      : mode === "draft_email"
        ? "Brief for the email…"
        : mode === "draft_social"
          ? "Brief for the social post…"
          : mode === "rewrite"
            ? "Paste copy to rewrite…"
            : "Notes to summarise (or rely on attachments)…";

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      className={cn(
        "shrink-0 border-border bg-white outline-none",
        open
          ? "pm-assistant-sheet fixed inset-0 z-50 flex h-dvh w-auto max-h-none flex-col border-0 shadow-soft md:z-40 lg:sticky lg:inset-auto lg:top-0 lg:z-auto lg:h-screen lg:max-h-screen lg:w-[22rem] lg:border-l lg:shadow-none"
          : "hidden border-l lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-11 lg:flex-col",
        className
      )}
      role={open && fullPage ? "dialog" : undefined}
      aria-modal={open && fullPage ? true : undefined}
      aria-label="Assistant"
    >
      {open ? (
        <>
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-brand">Assistant</h2>
              <p className="mt-0.5 text-xs text-muted">
                Brand-aware help for admins
              </p>
            </div>
            <button
              type="button"
              className="btn-ghost shrink-0 px-2.5 py-1.5 text-xs"
              onClick={onClose}
              aria-label="Collapse assistant"
            >
              <PanelRightClose className="h-4 w-4" />
              Hide
            </button>
          </div>
          <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          {(readOnly
            ? MODE_OPTIONS.filter(
                (option) =>
                  option.id === "chat" ||
                  option.id === "rewrite" ||
                  option.id === "summarise"
              )
            : MODE_OPTIONS
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              className={cn(
                "rounded-lg px-2.5 py-1 text-[11px] font-medium transition",
                mode === option.id
                  ? "bg-brand text-white"
                  : "bg-sand/70 text-muted hover:text-foreground"
              )}
              onClick={() => {
                setMode(option.id);
                setDraft(null);
                setError(null);
              }}
            >
              {option.label}
            </button>
          ))}
          <button
            type="button"
            className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-muted hover:text-foreground"
            onClick={clearSession}
          >
            <Trash2 className="h-3 w-3" />
            Clear
          </button>
        </div>

        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {error}
          </p>
        ) : null}

        {draft ? (
          <div className="rounded-xl border border-border bg-sand/40 px-3 py-3 text-xs">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <p className="font-medium text-brand">
                {draft.kind === "email"
                  ? "Email draft"
                  : draft.kind === "social"
                    ? "Social draft"
                    : draft.kind === "rewrite"
                      ? "Rewrite"
                      : "Summary"}
              </p>
              <button
                type="button"
                className="btn-secondary inline-flex items-center gap-1 px-2 py-1 text-[11px]"
                onClick={() => void onCopyDraft()}
              >
                <Copy className="h-3 w-3" />
                {copied ? "Copied" : "Copy"}
              </button>
              {draft.kind === "email" && !readOnly ? (
                <Link
                  href="/app/email"
                  className="btn-secondary px-2 py-1 text-[11px]"
                >
                  Open Email
                </Link>
              ) : null}
              {draft.kind === "social" && draft.suggestedCommand && !readOnly ? (
                <button
                  type="button"
                  className="btn-secondary px-2 py-1 text-[11px]"
                  disabled={busy}
                  onClick={() => {
                    const command = draft.suggestedCommand as string;
                    setPendingCommand(command);
                    void previewCommand(command);
                  }}
                >
                  Propose as content
                </button>
              ) : null}
            </div>
            <pre className="whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-foreground">
              {draftPlainText(draft)}
            </pre>
          </div>
        ) : null}

        <div className="space-y-3">
          {messages.length === 0 && !draft ? (
            <p className="text-xs text-muted">
              {readOnly
                ? "Ask about enquiry statistics, the library, events, or scheduled and published content. This assistant cannot save records."
                : "Upload a brief or asset, then ask for a draft, a rewrite, or to add a task, event, or social post. Nothing is saved until you confirm."}
            </p>
          ) : null}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "rounded-xl px-3 py-2 text-xs leading-relaxed",
                msg.role === "user"
                  ? "ml-6 bg-brand text-white"
                  : "mr-4 border border-border bg-white text-foreground"
              )}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
              {msg.commandText && !readOnly ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="btn-primary px-2.5 py-1 text-[11px] disabled:opacity-50"
                    disabled={busy}
                    onClick={() => void confirmCommand(msg.commandText)}
                  >
                    Confirm
                  </button>
                  <span className="text-[11px] text-muted">or type do it</span>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
          </div>
          <div className="border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {commandPreview && !readOnly ? (
              <div className="mb-3 rounded-xl border border-brand/20 bg-accent-soft/40 px-3 py-2.5 text-xs">
                <p className="font-medium text-brand">{commandPreview.summary}</p>
                {commandPreview.items.length > 1 ? (
                  <ul className="mt-1 max-h-28 list-disc space-y-0.5 overflow-y-auto pl-4 text-muted">
                    {commandPreview.items.map((item, index) => (
                      <li key={`${index}-${item}`}>{item}</li>
                    ))}
                  </ul>
                ) : null}
                {commandPreview.skipped.length ? (
                  <p className="mt-1 text-muted">
                    Not included: {commandPreview.skipped.join("; ")}
                  </p>
                ) : null}
                <p className="mt-1 text-muted">Press Confirm, or type do it.</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="btn-primary px-2.5 py-1 text-xs disabled:opacity-50"
                    disabled={busy}
                    onClick={() => void confirmCommand()}
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    className="btn-secondary px-2.5 py-1 text-xs"
                    onClick={() => {
                      const dropped = pendingCommand;
                      setCommandPreview(null);
                      setPendingCommand(null);
                      if (!dropped) return;
                      setMessages((prev) =>
                        prev.map((message) =>
                          message.commandText === dropped
                            ? { ...message, commandText: null }
                            : message
                        )
                      );
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
            {commandNotice ? (
              <p className="mb-2 text-xs text-brand" aria-live="polite">
                {commandNotice.message}{" "}
                {commandNotice.href ? (
                  <Link href={commandNotice.href} className="font-medium underline">
                    Open it
                  </Link>
                ) : null}
              </p>
            ) : null}
            <form onSubmit={onSubmit} className="space-y-2">
              {attachments.length ? (
                <ul className="flex flex-wrap gap-1.5">
                  {attachments.map((a) => (
                    <li
                      key={a.url}
                      className="inline-flex max-w-full items-center gap-1 rounded-lg border border-border bg-sand/50 px-2 py-1 text-[11px] text-brand"
                    >
                      <span className="truncate">{a.name}</span>
                      <button
                        type="button"
                        className="shrink-0 text-muted hover:text-foreground"
                        aria-label={`Remove ${a.name}`}
                        onClick={() =>
                          setAttachments((prev) =>
                            prev.filter((x) => x.url !== a.url)
                          )
                        }
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <textarea
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                rows={3}
                placeholder={placeholder}
                className="w-full resize-none rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none ring-brand/30 placeholder:text-muted focus:ring-2"
                disabled={busy}
              />
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept={UPLOAD_ACCEPT}
                  multiple
                  onChange={onPickFiles}
                />
                <button
                  type="button"
                  className="btn-secondary inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy || uploading}
                >
                  {uploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileUp className="h-3.5 w-3.5" />
                  )}
                  Upload
                </button>
                <button
                  type="submit"
                  className="btn-primary ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50"
                  disabled={
                    busy ||
                    uploading ||
                    (!composer.trim() &&
                      !(
                        (mode === "summarise" ||
                          mode === "draft_email" ||
                          mode === "draft_social") &&
                        attachments.length
                      ))
                  }
                >
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {busy ? "Working…" : mode === "chat" ? "Send" : "Generate"}
                </button>
              </div>
              <p className="text-[11px] text-muted">
                Images, PDF, Word, Excel, CSV or short video · max {MAX_MB}MB each
              </p>
            </form>
          </div>
        </>
      ) : (
        <button
          type="button"
          className="flex h-full w-full flex-col items-center gap-3 py-4 text-muted hover:bg-sand hover:text-brand"
          onClick={onOpen}
          aria-label="Show assistant"
        >
          <Sparkles className="h-4 w-4 shrink-0" />
          <span className="text-[11px] font-medium [writing-mode:vertical-rl]">
            Assistant
          </span>
        </button>
      )}
    </aside>
  );
}

export function AiAssistantTrigger({
  open,
  onToggle,
  className,
}: {
  open: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={open}
      className={cn(
        "inline-flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-muted transition hover:bg-sand hover:text-foreground",
        open && "bg-accent-soft text-brand",
        className
      )}
      aria-label={open ? "Collapse assistant" : "Show assistant"}
    >
      <Sparkles className="h-4 w-4 shrink-0 text-brand" />
      Assistant
    </button>
  );
}
