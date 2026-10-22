"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  DEFAULT_CHAT_GREETING,
  DEFAULT_ENQUIRY_CHAT_GUIDANCE,
} from "@/lib/chat/enquiry-guidance";
import { ALLOWLISTED_SITE_PAGES } from "@/lib/chat/site-pages";
import { cn } from "@/lib/utils";
import type {
  ChatKbDocument,
  ChatMessage,
  ChatSession,
  ChatSettings,
} from "@/lib/types";

type Tab = "inbox" | "train" | "test" | "deploy" | "analyze";

type Props = {
  configured: boolean;
  initialSessionId?: string;
};

function sessionActivityAt(s: ChatSession): number {
  const raw = s.last_message_at || s.updated_at || s.created_at || "";
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Newest activity first — stable inbox order. */
function sortSessionsByDate(sessions: ChatSession[]): ChatSession[] {
  return [...sessions].sort((a, b) => sessionActivityAt(b) - sessionActivityAt(a));
}

function formatSessionWhen(s: ChatSession): string {
  const t = sessionActivityAt(s);
  if (!t) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(t));
  } catch {
    return "";
  }
}

function statusLabel(s: ChatSession): string {
  if (s.status === "waiting") return "Waiting for team";
  if (s.status === "human") {
    return s.assignee_email ? `With ${s.assignee_email}` : "With the team";
  }
  if (s.status === "closed") return "Closed";
  return "Assistant answering";
}

function visitorLabel(s: ChatSession): string {
  return s.visitor_name || s.visitor_email || "Website visitor";
}

function stripChoiceTag(body: string): string {
  return body
    .replace(/\[\[choices:[\s\S]*?\]\]/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function messageWho(m: ChatMessage): string {
  if (m.role === "visitor") return "Visitor";
  if (m.role === "staff") return m.author_name || "Team";
  if (m.role === "assistant") return "Peters & May assistant";
  return "System";
}

function formatMessageWhen(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(t));
  } catch {
    return "";
  }
}

export function ChatClient({ configured, initialSessionId }: Props) {
  const [tab, setTab] = useState<Tab>("inbox");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSessionId ?? null
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reply, setReply] = useState("");
  const [settings, setSettings] = useState<ChatSettings | null>(null);
  const [siteKeyConfigured, setSiteKeyConfigured] = useState(false);
  const [documents, setDocuments] = useState<ChatKbDocument[]>([]);
  const [insights, setInsights] = useState<{
    total_sessions: number;
    waiting: number;
    human: number;
    closed: number;
    with_lead: number;
    handoff_rate: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [inboxFilter, setInboxFilter] = useState<"needs" | "open" | "closed">(
    "needs"
  );
  const [savedGuidance, setSavedGuidance] = useState("");
  const [savedGreeting, setSavedGreeting] = useState("");
  const [testInput, setTestInput] = useState("");
  const [testLog, setTestLog] = useState<
    Array<{ role: string; body: string }>
  >([]);
  const [kbForm, setKbForm] = useState({
    id: "",
    title: "",
    source_url: "",
    body: "",
  });

  const loadSessions = useCallback(async () => {
    const status =
      inboxFilter === "needs"
        ? "waiting"
        : inboxFilter === "closed"
          ? "closed"
          : "open";
    const res = await fetch(
      `/api/chat/admin?view=sessions&status=${encodeURIComponent(status)}`
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to load sessions");
    setSessions(sortSessionsByDate(data.sessions ?? []));
  }, [inboxFilter]);

  const loadSettings = useCallback(async () => {
    const res = await fetch("/api/chat/admin?view=settings");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to load settings");
    setSettings(data.settings ?? null);
    setSavedGuidance(data.settings?.guidance ?? "");
    setSavedGreeting(data.settings?.greeting ?? "");
    setSiteKeyConfigured(Boolean(data.site_key_configured));
  }, []);

  const loadKb = useCallback(async () => {
    const res = await fetch("/api/chat/admin?view=kb");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to load KB");
    setDocuments(data.documents ?? []);
  }, []);

  const loadInsights = useCallback(async () => {
    const res = await fetch("/api/chat/admin?view=insights");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to load insights");
    setInsights(data.insights ?? null);
  }, []);

  const loadTranscript = useCallback(async (sessionId: string) => {
    const res = await fetch("/api/chat/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get_session", session_id: sessionId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to load transcript");
    const msgs = (data.messages ?? []) as ChatMessage[];
    setMessages(
      [...msgs].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
    );
    if (data.session) {
      // Update in place and keep newest activity first — do not bump to top on select/poll.
      setSessions((prev) =>
        sortSessionsByDate(
          prev.map((s) => (s.id === data.session.id ? data.session : s))
        )
      );
    }
  }, []);

  useEffect(() => {
    if (!configured) return;
    void (async () => {
      try {
        setError("");
        await Promise.all([loadSessions(), loadSettings()]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Load failed");
      }
    })();
  }, [configured, loadSessions, loadSettings]);

  useEffect(() => {
    if (!selectedId || !configured) return;
    void loadTranscript(selectedId).catch((e) =>
      setError(e instanceof Error ? e.message : "Transcript failed")
    );
    const t = setInterval(() => {
      void loadTranscript(selectedId).catch(() => undefined);
    }, 8000);
    return () => clearInterval(t);
  }, [selectedId, configured, loadTranscript]);

  useEffect(() => {
    if (!configured || tab !== "inbox") return;
    const t = setInterval(() => {
      void loadSessions().catch(() => undefined);
    }, 8000);
    return () => clearInterval(t);
  }, [configured, tab, loadSessions]);

  useEffect(() => {
    const waiting = sessions.filter((s) => s.status === "waiting").length;
    if (!waiting) return;
    const prev = document.title;
    document.title = `(${waiting}) Website chat`;
    return () => {
      document.title = prev;
    };
  }, [sessions]);

  useEffect(() => {
    if (!configured) return;
    if (tab === "train") void loadKb().catch(() => undefined);
    if (tab === "deploy") void loadSettings().catch(() => undefined);
    if (tab === "analyze") void loadInsights().catch(() => undefined);
  }, [tab, configured, loadKb, loadSettings, loadInsights]);

  const selected = useMemo(
    () => sessions.find((s) => s.id === selectedId) ?? null,
    [sessions, selectedId]
  );

  async function sendReply() {
    if (!selectedId || !reply.trim()) return;
    if (selected?.status === "closed") {
      setError("The visitor closed this chat, so it cannot be taken over.");
      return;
    }
    if (selected?.status !== "human") {
      setError("Take over this chat before you reply.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/chat/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reply",
          session_id: selectedId,
          body: reply.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Reply failed");
      setReply("");
      await loadTranscript(selectedId);
      await loadSessions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reply failed");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: ChatSession["status"]) {
    if (!selectedId) return;
    if (selected?.status === "closed" && status !== "closed") {
      setError("The visitor closed this chat, so it cannot be taken over.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/chat/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "patch_session",
          session_id: selectedId,
          status,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      await loadSessions();
      await loadTranscript(selectedId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings(patch: Partial<ChatSettings>) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/chat/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_settings", ...patch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setSettings(data.settings);
      if (data.settings) {
        setSavedGuidance(data.settings.guidance ?? "");
        setSavedGreeting(data.settings.greeting ?? "");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveKb() {
    if (!kbForm.title.trim() || !kbForm.body.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/chat/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert_kb",
          id: kbForm.id || undefined,
          title: kbForm.title,
          body: kbForm.body,
          source_url: kbForm.source_url,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "KB save failed");
      setKbForm({ id: "", title: "", source_url: "", body: "" });
      await loadKb();
    } catch (e) {
      setError(e instanceof Error ? e.message : "KB save failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeKb(id: string) {
    if (!confirm("Delete this knowledge document?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/chat/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_kb", id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      await loadKb();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function runTest() {
    if (!testInput.trim()) return;
    setBusy(true);
    setError("");
    const userLine = testInput.trim();
    setTestLog((prev) => [...prev, { role: "visitor", body: userLine }]);
    setTestInput("");
    try {
      const res = await fetch("/api/chat/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", message: userLine }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Test failed");
      setTestLog((prev) => [
        ...prev,
        { role: "assistant", body: stripChoiceTag(data.reply?.body ?? "") },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test failed");
    } finally {
      setBusy(false);
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "inbox", label: "Inbox" },
    { id: "train", label: "Train" },
    { id: "test", label: "Test" },
    { id: "deploy", label: "Deploy" },
    { id: "analyze", label: "Analyse" },
  ];

  if (!configured) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Website chat"
          description="Supabase service role is required before chat can store sessions."
        />
        <p className="text-sm text-muted">
          Configure the database migration{" "}
          <code className="text-xs">041_website_chat</code> and set{" "}
          <code className="text-xs">CHAT_SITE_KEY</code> for the WordPress
          plugin.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Website chat"
        description="Train knowledge and tone, test answers, deploy to WordPress, and reply when visitors ask for the team."
      />

      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm",
              tab === t.id
                ? "bg-[#0B2545] text-white"
                : "bg-sand text-foreground hover:bg-border/60"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {tab === "inbox" ? (
        <div className="grid gap-4 lg:grid-cols-[240px_1fr_220px]">
          <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-white">
            <div className="flex gap-1 border-b border-border p-2">
              {(
                [
                  ["needs", "Needs reply"],
                  ["open", "Open"],
                  ["closed", "Closed"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setInboxFilter(id)}
                  className={cn(
                    "rounded px-2 py-1 text-xs",
                    inboxFilter === id
                      ? "bg-[#0B2545] text-white"
                      : "text-muted hover:bg-sand"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {sessions.length === 0 ? (
              <p className="p-4 text-sm text-muted">No conversations in this view.</p>
            ) : (
              sessions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  className={cn(
                    "block w-full border-b border-border px-3 py-3 text-left text-sm",
                    selectedId === s.id ? "bg-sand" : "hover:bg-sand/60"
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="truncate font-medium text-[#0B2545]">
                      {visitorLabel(s)}
                    </div>
                    <div className="shrink-0 text-[11px] text-muted">
                      {formatSessionWhen(s)}
                    </div>
                  </div>
                  <div className="truncate text-xs text-muted">
                    {statusLabel(s)}
                    {s.page_title ? ` · ${s.page_title}` : ""}
                  </div>
                </button>
              ))
            )}
          </div>
          <div className="flex min-h-[70vh] flex-col rounded-lg border border-border bg-white">
            {!selected ? (
              <p className="p-6 text-sm text-muted">
                Select a conversation to reply.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
                  <span className="text-sm font-medium text-[#0B2545]">
                    {selected.visitor_email || "No email yet"}
                  </span>
                  <span className="rounded bg-sand px-2 py-0.5 text-xs">
                    {statusLabel(selected)}
                  </span>
                  {selected.enquiry_id ? (
                    <a
                      href="/app/enquiries"
                      className="text-xs text-[#007DC5] underline"
                    >
                      Linked enquiry
                    </a>
                  ) : null}
                  <div className="ml-auto flex gap-2">
                    <button
                      type="button"
                      className="rounded border border-border px-2 py-1 text-xs"
                      disabled={busy || messages.length === 0}
                      onClick={() => {
                        const lines = messages
                          .map((m) => {
                            const who =
                              m.role === "visitor"
                                ? "Visitor"
                                : m.role === "staff"
                                  ? m.author_name
                                    ? `Staff (${m.author_name})`
                                    : "Staff"
                                  : m.role === "assistant"
                                    ? "Assistant"
                                    : "System";
                            const body = (m.body ?? "").trim();
                            return body ? `[${who}] ${body}` : "";
                          })
                          .filter(Boolean);
                        const text = lines.join("\n\n");
                        const blob = new Blob([text], {
                          type: "text/plain;charset=utf-8",
                        });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `chat-transcript-${selected.id.slice(0, 8)}.txt`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      Download transcript
                    </button>
                    <button
                      type="button"
                      className="rounded border border-border px-2 py-1 text-xs disabled:opacity-50"
                      onClick={() => setStatus("human")}
                      disabled={busy || selected.status === "closed"}
                    >
                      Take over
                    </button>
                    <button
                      type="button"
                      className="rounded border border-border px-2 py-1 text-xs disabled:opacity-50"
                      onClick={() => setStatus("closed")}
                      disabled={busy || selected.status === "closed"}
                    >
                      Close
                    </button>
                  </div>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {selected.status === "human" ? (
                    <p className="rounded-md bg-[#007DC5]/10 px-3 py-2 text-xs text-[#0B2545]">
                      You have taken this chat. The assistant stays quiet while you reply.
                    </p>
                  ) : null}
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        "max-w-[85%] rounded-xl px-3 py-2 text-sm",
                        m.role === "visitor"
                          ? "ml-auto bg-[#0B2545] text-white"
                          : m.role === "staff"
                            ? "bg-[#007DC5]/15 text-[#0B2545]"
                            : m.role === "system"
                              ? "mx-auto bg-sand text-xs text-muted"
                              : "bg-[#E3E6E9] text-[#0B2545]"
                      )}
                    >
                      <div
                        className={cn(
                          "mb-1 text-[11px]",
                          m.role === "visitor" ? "text-white/70" : "text-muted"
                        )}
                      >
                        {messageWho(m)}
                        {formatMessageWhen(m.created_at)
                          ? ` · ${formatMessageWhen(m.created_at)}`
                          : ""}
                      </div>
                      {stripChoiceTag(m.body)}
                    </div>
                  ))}
                </div>
                <div className="border-t border-border p-3">
                  {selected.status === "closed" ? (
                    <p className="text-sm text-muted">
                      The visitor closed this chat, so it cannot be taken over.
                    </p>
                  ) : selected.status !== "human" ? (
                    <p className="text-sm text-muted">
                      Take over before you reply, so the assistant and the team are not both answering.
                    </p>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        className="flex-1 rounded-md border border-border px-3 py-2 text-sm"
                        placeholder="Reply as the team…"
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void sendReply();
                          }
                        }}
                      />
                      <button
                        type="button"
                        disabled={busy || !reply.trim()}
                        onClick={() => void sendReply()}
                        className="rounded-md bg-[#0B2545] px-4 py-2 text-sm text-white disabled:opacity-50"
                      >
                        Send
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          <aside className="max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-white p-4 text-sm">
            {!selected ? (
              <p className="text-sm text-muted">Visitor details appear here.</p>
            ) : (
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-muted">Name</dt>
                  <dd>{selected.visitor_name || "Not given"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Email</dt>
                  <dd>{selected.visitor_email || "Not given"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Company</dt>
                  <dd>{selected.visitor_company || "Not given"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Page</dt>
                  <dd className="break-words">
                    {selected.page_title || selected.page_url || "Not recorded"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Campaign</dt>
                  <dd>
                    {typeof selected.utm?.utm_campaign === "string" &&
                    selected.utm.utm_campaign
                      ? selected.utm.utm_campaign
                      : "None"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Enquiry</dt>
                  <dd>
                    {selected.enquiry_id ? (
                      <a
                        href="/app/enquiries"
                        className="text-[#007DC5] underline"
                      >
                        Open enquiries ({selected.enquiry_id.slice(0, 8)})
                      </a>
                    ) : (
                      "No lead yet"
                    )}
                  </dd>
                </div>
                <p className="text-xs text-muted">
                  Staff only. Where they are based is in the transcript. It does not choose an office, and it is separate from where the yacht or cargo is now.
                </p>
              </dl>
            )}
          </aside>
        </div>
      ) : null}

      {tab === "train" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3 rounded-lg border border-border bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-[#0B2545]">
                Tone and policies
              </h2>
              <span className="rounded bg-sand px-2 py-0.5 text-xs text-[#0B2545]">
                {(settings?.guidance ?? "") !== savedGuidance ||
                (settings?.greeting ?? "") !== savedGreeting
                  ? "Unsaved"
                  : !(settings?.guidance ?? "").trim() ||
                      settings?.guidance === DEFAULT_ENQUIRY_CHAT_GUIDANCE
                    ? "Recommended"
                    : "Custom"}
              </span>
            </div>
            <p className="text-xs text-muted">
              Empty guidance uses the recommended enquiry qualification SOP
              (yacht, freight, customs, careers, suppliers, and so on). Load it
              here to edit and save your own version.
            </p>
            <textarea
              className="min-h-[220px] w-full rounded-md border border-border px-3 py-2 text-sm"
              value={settings?.guidance ?? ""}
              placeholder="Leave blank to use the recommended Peters & May enquiry guidance…"
              onChange={(e) =>
                setSettings((s) =>
                  s ? { ...s, guidance: e.target.value } : s
                )
              }
            />
            <label className="block text-xs text-muted">Greeting</label>
            <input
              className="w-full rounded-md border border-border px-3 py-2 text-sm"
              value={settings?.greeting ?? ""}
              onChange={(e) =>
                setSettings((s) =>
                  s ? { ...s, greeting: e.target.value } : s
                )
              }
            />
            <div className="max-w-[85%] rounded-xl bg-[#E3E6E9] px-3 py-2 text-sm text-[#0B2545]">
              <div className="mb-1 text-[11px] text-muted">
                Peters & May assistant
              </div>
              {settings?.greeting?.trim() || DEFAULT_CHAT_GREETING}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || !settings}
                onClick={() => {
                  const dirty =
                    (settings?.guidance ?? "") !== savedGuidance ||
                    (settings?.greeting ?? "") !== savedGreeting;
                  if (
                    dirty &&
                    !window.confirm(
                      "Discard unsaved guidance and restore the recommended version?"
                    )
                  ) {
                    return;
                  }
                  setSettings((s) =>
                    s
                      ? {
                          ...s,
                          guidance: DEFAULT_ENQUIRY_CHAT_GUIDANCE,
                          greeting: DEFAULT_CHAT_GREETING,
                        }
                      : s
                  );
                }}
                className="rounded-md border border-border px-3 py-2 text-sm text-[#0B2545] disabled:opacity-50"
              >
                Restore recommended
              </button>
              <button
                type="button"
                disabled={busy || !settings}
                onClick={() =>
                  void saveSettings({
                    guidance: settings?.guidance,
                    greeting: settings?.greeting,
                  })
                }
                className="rounded-md bg-[#0B2545] px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                Save guidance
              </button>
            </div>
          </div>
          <div className="space-y-3 rounded-lg border border-border bg-white p-4">
            <h2 className="text-sm font-semibold text-[#0B2545]">
              Knowledge base
            </h2>
            <div className="max-h-48 overflow-y-auto text-sm">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs text-muted">
                    <th className="py-1 font-medium">Title</th>
                    <th className="py-1 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((d) => (
                    <tr key={d.id} className="border-t border-border">
                      <td className="py-2">
                        <button
                          type="button"
                          className="text-left font-medium text-[#0B2545]"
                          onClick={() =>
                            setKbForm({
                              id: d.id,
                              title: d.title,
                              source_url: d.source_url,
                              body: d.body,
                            })
                          }
                        >
                          {d.title}
                        </button>
                      </td>
                      <td className="py-2 text-xs text-muted">
                        {d.active ? "Active" : "Inactive"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <input
              className="w-full rounded-md border border-border px-3 py-2 text-sm"
              placeholder="Title"
              value={kbForm.title}
              onChange={(e) =>
                setKbForm((f) => ({ ...f, title: e.target.value }))
              }
            />
            <input
              className="w-full rounded-md border border-border px-3 py-2 text-sm"
              placeholder="Source URL (optional)"
              value={kbForm.source_url}
              onChange={(e) =>
                setKbForm((f) => ({ ...f, source_url: e.target.value }))
              }
            />
            <textarea
              className="min-h-[120px] w-full rounded-md border border-border px-3 py-2 text-sm"
              placeholder="Approved public content"
              value={kbForm.body}
              onChange={(e) =>
                setKbForm((f) => ({ ...f, body: e.target.value }))
              }
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveKb()}
                className="rounded-md bg-[#0B2545] px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                {kbForm.id ? "Update document" : "Add document"}
              </button>
              {kbForm.id ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void removeKb(kbForm.id)}
                  className="rounded-md border border-border px-3 py-2 text-sm text-[#0B2545] disabled:opacity-50"
                >
                  Delete document
                </button>
              ) : null}
            </div>
            <div>
              <h3 className="text-xs font-semibold text-[#0B2545]">
                Published pages the assistant may read
              </h3>
              <ul className="mt-2 space-y-1 text-xs text-muted">
                {ALLOWLISTED_SITE_PAGES.map((p) => (
                  <li key={p.id}>
                    {p.title} — {p.url}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "test" ? (
        <div className="mx-auto max-w-xl space-y-3 rounded-lg border border-border bg-white p-4">
          <p className="text-sm text-muted">
            Try a question against the saved guidance. Choice tags stay hidden.
            This does not message a visitor.
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              "Is there a sailing for Fort Lauderdale?",
              "I need to ship a yacht",
              "Where are your offices?",
            ].map((q) => (
              <button
                key={q}
                type="button"
                className="rounded border border-border px-2 py-1 text-xs text-[#0B2545]"
                onClick={() => setTestInput(q)}
              >
                {q}
              </button>
            ))}
            <button
              type="button"
              className="rounded border border-border px-2 py-1 text-xs text-muted"
              onClick={() => setTestLog([])}
            >
              Reset
            </button>
          </div>
          <div className="max-h-[50vh] space-y-2 overflow-y-auto rounded-md bg-sand/40 p-3">
            {testLog.length === 0 ? (
              <p className="text-sm text-muted">Ask a test question…</p>
            ) : (
              testLog.map((m, i) => (
                <div
                  key={`${i}-${m.role}`}
                  className={cn(
                    "rounded-2xl px-3 py-2 text-sm",
                    m.role === "visitor"
                      ? "ml-8 bg-[#0B2545] text-white"
                      : "mr-8 bg-[#E3E6E9] text-[#0B2545]"
                  )}
                >
                  {stripChoiceTag(m.body)}
                </div>
              ))
            )}
          </div>
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-md border border-border px-3 py-2 text-sm"
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              placeholder="Message…"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void runTest();
                }
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void runTest()}
              className="rounded-md bg-[#0B2545] px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      ) : null}

      {tab === "deploy" ? (
        <div className="max-w-xl space-y-4 rounded-lg border border-border bg-white p-4">
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={Boolean(settings?.deployed)}
              onChange={(e) =>
                void saveSettings({ deployed: e.target.checked })
              }
            />
            Live answers
          </label>
          <p className="text-xs text-muted">
            This switch saves immediately. It is separate from guidance and the office-hours note.
          </p>
          <ul className="space-y-1 text-sm text-[#0B2545]">
            <li>Site key: {siteKeyConfigured ? "set" : "missing"}</li>
            <li>Live answers: {settings?.deployed ? "on" : "off"}</li>
            <li>Plugin active on the website</li>
            <li>HubSpot chat turned off</li>
          </ul>
          <label className="block text-xs text-muted">
            Office hours note (shown on handoff)
          </label>
          <textarea
            className="min-h-[80px] w-full rounded-md border border-border px-3 py-2 text-sm"
            value={settings?.office_hours_note ?? ""}
            onChange={(e) =>
              setSettings((s) =>
                s ? { ...s, office_hours_note: e.target.value } : s
              )
            }
          />
          <label className="block text-xs text-muted">
            Notify email — all website chat quotes / leads email here first
            (office auto-routing is off; forward manually for now)
          </label>
          <input
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
            value={settings?.notify_email ?? ""}
            onChange={(e) =>
              setSettings((s) =>
                s ? { ...s, notify_email: e.target.value } : s
              )
            }
            placeholder="sophie@petersandmay.com"
          />
          <button
            type="button"
            disabled={busy || !settings}
            onClick={() =>
              void saveSettings({
                office_hours_note: settings?.office_hours_note,
                notify_email: settings?.notify_email,
              })
            }
            className="rounded-md bg-[#0B2545] px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            Save deploy settings
          </button>
          <div className="rounded-md bg-sand px-3 py-2 text-xs text-muted">
            Leads also land in Hub Enquiries → Website chat, and mirror to the
            Portal. WordPress: Hub URL{" "}
            <code>https://marketing.petersandmay.com</code> +{" "}
            <code>CHAT_SITE_KEY</code>.
          </div>
        </div>
      ) : null}

      {tab === "analyze" && insights ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Leads captured", insights.with_lead],
              [
                "Lead rate",
                insights.total_sessions
                  ? `${Math.round((insights.with_lead / insights.total_sessions) * 100)}%`
                  : "0%",
              ],
              ["Asked for the team", `${insights.handoff_rate}%`],
              ["Waiting now", insights.waiting],
            ].map(([label, value]) =>
              label === "Waiting now" ? (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    setInboxFilter("needs");
                    setTab("inbox");
                  }}
                  className="rounded-lg border border-border bg-white p-4 text-left"
                >
                  <div className="text-xs text-muted">{label}</div>
                  <div className="text-2xl font-semibold text-[#0B2545]">
                    {value}
                  </div>
                </button>
              ) : (
                <div
                  key={label}
                  className="rounded-lg border border-border bg-white p-4"
                >
                  <div className="text-xs text-muted">{label}</div>
                  <div className="text-2xl font-semibold text-[#0B2545]">
                    {value}
                  </div>
                </div>
              )
            )}
          </div>
          <p className="text-sm text-muted">
            {insights.total_sessions} conversations, then{" "}
            {Math.round((insights.handoff_rate / 100) * insights.total_sessions)}{" "}
            asked for the team, then {insights.with_lead} leads. A lead can be
            captured from the guided form without a handoff.
          </p>
        </div>
      ) : null}
    </div>
  );
}
