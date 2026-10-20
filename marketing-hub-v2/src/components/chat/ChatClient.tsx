"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  DEFAULT_CHAT_GREETING,
  DEFAULT_ENQUIRY_CHAT_GUIDANCE,
} from "@/lib/chat/enquiry-guidance";
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
  const [showClosed, setShowClosed] = useState(false);
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
    const status = showClosed ? "all" : "open";
    const res = await fetch(
      `/api/chat/admin?view=sessions&status=${encodeURIComponent(status)}`
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to load sessions");
    setSessions(sortSessionsByDate(data.sessions ?? []));
  }, [showClosed]);

  const loadSettings = useCallback(async () => {
    const res = await fetch("/api/chat/admin?view=settings");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to load settings");
    setSettings(data.settings ?? null);
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
        { role: "assistant", body: data.reply?.body ?? "" },
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
    { id: "analyze", label: "Analyze" },
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
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-white">
            <label className="flex cursor-pointer items-center gap-2 border-b border-border px-3 py-2 text-xs text-muted">
              <input
                type="checkbox"
                className="rounded border-border"
                checked={showClosed}
                onChange={(e) => setShowClosed(e.target.checked)}
              />
              Show closed chats
            </label>
            {sessions.length === 0 ? (
              <p className="p-4 text-sm text-muted">
                {showClosed
                  ? "No conversations yet."
                  : "No open conversations."}
              </p>
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
                      {s.visitor_email || s.visitor_name || "Visitor"}
                    </div>
                    <div className="shrink-0 text-[11px] text-muted">
                      {formatSessionWhen(s)}
                    </div>
                  </div>
                  <div className="truncate text-xs text-muted">
                    {s.status} · {s.page_title || s.page_url || s.id}
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
                    {selected.status}
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
                      className="rounded border border-border px-2 py-1 text-xs"
                      onClick={() => setStatus("human")}
                      disabled={busy}
                    >
                      Take over
                    </button>
                    <button
                      type="button"
                      className="rounded border border-border px-2 py-1 text-xs"
                      onClick={() => setStatus("closed")}
                      disabled={busy}
                    >
                      Close
                    </button>
                  </div>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                        m.role === "visitor"
                          ? "ml-auto bg-[#0B2545] text-white"
                          : m.role === "staff"
                            ? "bg-[#007DC5]/15 text-[#0B2545]"
                            : m.role === "system"
                              ? "mx-auto bg-sand text-xs text-muted"
                              : "bg-[#E3E6E9] text-[#0B2545]"
                      )}
                    >
                      {m.body}
                    </div>
                  ))}
                </div>
                <div className="border-t border-border p-3">
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
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {tab === "train" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3 rounded-lg border border-border bg-white p-4">
            <h2 className="text-sm font-semibold text-[#0B2545]">
              Tone and policies
            </h2>
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
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || !settings}
                onClick={() =>
                  setSettings((s) =>
                    s
                      ? {
                          ...s,
                          guidance: DEFAULT_ENQUIRY_CHAT_GUIDANCE,
                          greeting: DEFAULT_CHAT_GREETING,
                        }
                      : s
                  )
                }
                className="rounded-md border border-border px-3 py-2 text-sm text-[#0B2545] disabled:opacity-50"
              >
                Load recommended guidance
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
            <ul className="max-h-48 space-y-2 overflow-y-auto text-sm">
              {documents.map((d) => (
                <li
                  key={d.id}
                  className="flex items-start justify-between gap-2 rounded border border-border px-2 py-2"
                >
                  <button
                    type="button"
                    className="text-left"
                    onClick={() =>
                      setKbForm({
                        id: d.id,
                        title: d.title,
                        source_url: d.source_url,
                        body: d.body,
                      })
                    }
                  >
                    <div className="font-medium">{d.title}</div>
                    <div className="text-xs text-muted">
                      {d.active ? "Active" : "Inactive"}
                    </div>
                  </button>
                  <button
                    type="button"
                    className="text-xs text-red-600"
                    onClick={() => void removeKb(d.id)}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
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
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveKb()}
              className="rounded-md bg-[#0B2545] px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {kbForm.id ? "Update document" : "Add document"}
            </button>
          </div>
        </div>
      ) : null}

      {tab === "test" ? (
        <div className="mx-auto max-w-xl space-y-3 rounded-lg border border-border bg-white p-4">
          <p className="text-sm text-muted">
            Playground uses the current knowledge base and guidance. It does not
            require Deploy to be on.
          </p>
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
                  {m.body}
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
            Deploy live answers to the WordPress plugin
          </label>
          <p className="text-sm text-muted">
            Site key configured:{" "}
            {siteKeyConfigured ? "yes (CHAT_SITE_KEY)" : "no — set CHAT_SITE_KEY"}
          </p>
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
            Notify email (optional; defaults to marketing alert address)
          </label>
          <input
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
            value={settings?.notify_email ?? ""}
            onChange={(e) =>
              setSettings((s) =>
                s ? { ...s, notify_email: e.target.value } : s
              )
            }
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
            WordPress plugin settings: Hub URL{" "}
            <code>https://marketing.petersandmay.com</code> and the same site
            key as <code>CHAT_SITE_KEY</code>. CORS via{" "}
            <code>CHAT_CORS_ORIGINS</code> (defaults include petersandmay.com).
          </div>
        </div>
      ) : null}

      {tab === "analyze" && insights ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Conversations", insights.total_sessions],
            ["Waiting", insights.waiting],
            ["With human", insights.human],
            ["Closed", insights.closed],
            ["With lead", insights.with_lead],
            ["Handoff rate %", insights.handoff_rate],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-lg border border-border bg-white p-4"
            >
              <div className="text-xs text-muted">{label}</div>
              <div className="text-2xl font-semibold text-[#0B2545]">
                {value}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
