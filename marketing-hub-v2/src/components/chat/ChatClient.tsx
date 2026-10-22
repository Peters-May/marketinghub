"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { RecordDrawer } from "@/components/ui/RecordDrawer";
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

function waitAge(s: ChatSession): string {
  const t = sessionActivityAt(s);
  if (!t) return "";
  const mins = Math.max(1, Math.round((Date.now() - t) / 60000));
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  return `${hours} hr`;
}

function staffFirstName(email: string): string {
  const local = email.split("@")[0] ?? "";
  const token = local.split(/[._+\-]/).find((part) => part.trim()) ?? "";
  if (!token) return "";
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

function statusLabel(s: ChatSession): string {
  if (s.status === "waiting") return `Waiting · ${waitAge(s)}`;
  if (s.status === "human") {
    const first = staffFirstName(s.assignee_email || "");
    return first ? `With ${first}` : "With the team";
  }
  if (s.status === "closed") return "Closed";
  return "Assistant answering";
}

function statusTone(s: ChatSession): string {
  if (s.status === "waiting") return "border border-[#e7dcc2] bg-[#f6efe0] text-[#7a5a10]";
  if (s.status === "human") return "bg-[#0B2545] text-white";
  if (s.status === "closed") return "border border-[#e3e6e9] bg-[#f4f6f7] text-[#5b6472]";
  return "border border-[#cfe5f5] bg-[#e6f2fa] text-[#005f97]";
}

function visitorLabel(s: ChatSession): string {
  if (s.visitor_name) return s.visitor_name;
  if (s.visitor_email) return s.visitor_email;
  return s.page_title ? `Visitor on ${s.page_title}` : "Website visitor";
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

function guidedEnquiry(body: string): {
  title: string;
  rows: Array<{ label: string; value: string }>;
} | null {
  const text = stripChoiceTag(body);
  if (!/enquiry \((guided form|pasted details)\):/i.test(text)) return null;
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const title = (lines[0] ?? "Enquiry").replace(/:$/, "");
  const rows = lines.slice(1).map((line) => {
    const split = line.indexOf(":");
    if (split < 0) return { label: "Note", value: line };
    return {
      label: line.slice(0, split).trim(),
      value: line.slice(split + 1).trim(),
    };
  });
  return { title, rows };
}

function guidedField(
  guided: { rows: Array<{ label: string; value: string }> } | null,
  match: (label: string) => boolean
): string {
  const row = guided?.rows.find((item) => match(item.label.toLowerCase()));
  return row?.value || "Not given";
}

function formatDayMonth(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
    }).format(new Date(t));
  } catch {
    return "";
  }
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
  const [sessions, setSessions] = useState<
    Array<ChatSession & { last_body?: string }>
  >([]);
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
  const [testSessionId, setTestSessionId] = useState("");
  const [testUseDraft, setTestUseDraft] = useState(false);
  const [insightRange, setInsightRange] = useState<"30" | "90" | "all">("30");
  const [inboxQuery, setInboxQuery] = useState("");
  const [testLog, setTestLog] = useState<
    Array<{ role: string; body: string; choices?: string[] }>
  >([]);
  const [kbOpen, setKbOpen] = useState(false);
  const [kbForm, setKbForm] = useState({
    id: "",
    title: "",
    source_url: "",
    body: "",
  });

  const loadSessions = useCallback(async () => {
    const res = await fetch("/api/chat/admin?view=sessions&status=all");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to load sessions");
    setSessions(sortSessionsByDate(data.sessions ?? []));
  }, []);

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
    const from =
      insightRange === "all"
        ? ""
        : new Date(
            Date.now() - Number(insightRange) * 24 * 60 * 60 * 1000
          ).toISOString();
    const res = await fetch(
      `/api/chat/admin?view=insights${from ? `&from=${encodeURIComponent(from)}` : ""}`
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to load insights");
    setInsights(data.insights ?? null);
  }, [insightRange]);

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
      setKbOpen(false);
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

  async function runTest(message?: string) {
    const userLine = (message ?? testInput).trim();
    if (!userLine) return;
    setBusy(true);
    setError("");
    setTestLog((prev) => [...prev, { role: "visitor", body: userLine }]);
    setTestInput("");
    try {
      const res = await fetch("/api/chat/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test",
          message: userLine,
          session_id: testSessionId || undefined,
          guidance: testUseDraft ? settings?.guidance : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Test failed");
      if (data.session?.id) setTestSessionId(data.session.id);
      setTestLog((prev) => [
        ...prev,
        {
          role: "assistant",
          body: stripChoiceTag(data.reply?.body ?? ""),
          choices: Array.isArray(data.choices) ? data.choices : [],
        },
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
        description="Reply to visitors who ask for the team, and tune what the assistant says."
        actions={
          <span
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium",
              settings?.deployed
                ? "bg-[#e5f3ea] text-[#1f7a4c]"
                : "bg-[#f4f6f7] text-[#5b6472]"
            )}
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                settings?.deployed ? "bg-[#1f7a4c]" : "bg-[#5b6472]"
              )}
            />
            {settings?.deployed
              ? "Live on petersandmay.com"
              : "Not live"}
          </span>
        }
      />

      <div className="flex flex-wrap gap-1 border-b border-[#e3e6e9]">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              if (
                tab === "train" &&
                t.id !== "train" &&
                ((settings?.guidance ?? "") !== savedGuidance ||
                  (settings?.greeting ?? "") !== savedGreeting) &&
                !window.confirm("Leave Train with unsaved changes?")
              ) {
                return;
              }
              setTab(t.id);
            }}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-base",
              tab === t.id
                ? "border-[#007DC5] font-semibold text-[#005f97]"
                : "border-transparent text-[#5b6472]"
            )}
          >
            {t.label}
            {t.id === "inbox" &&
            sessions.filter((s) => s.status === "waiting").length > 0 ? (
              <span className="ml-2 rounded-full bg-[#f6efe0] px-2 py-0.5 text-xs text-[#7a5a10]">
                {sessions.filter((s) => s.status === "waiting").length}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {error ? (
        <p className="rounded-md border border-[#e5c7c5] bg-[#f7e8e7] px-3 py-2 text-sm text-[#b3261e]">
          {error}
        </p>
      ) : null}

      {tab === "inbox" ? (
        <div className="grid overflow-hidden rounded-lg border border-[#e3e6e9] bg-white lg:grid-cols-[320px_minmax(0,1fr)_296px]">
          <div className="max-h-[70vh] overflow-y-auto border-r border-[#e3e6e9]">
            <div className="border-b border-[#e3e6e9] p-2">
              <input
                className="field"
                placeholder="Search name, email or page"
                value={inboxQuery}
                onChange={(e) => setInboxQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-1 border-b border-[#e3e6e9] p-2 text-sm">
              {(
                [
                  ["needs", "Needs reply", sessions.filter((s) => s.status === "waiting").length],
                  ["open", "Open", sessions.filter((s) => s.status !== "closed").length],
                  ["closed", "Closed", null],
                ] as const
              ).map(([id, label, count]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setInboxFilter(id)}
                  className={cn(
                    "flex-1 rounded px-2 py-1.5 text-xs font-semibold",
                    inboxFilter === id
                      ? "bg-[#0B2545] text-white"
                      : "text-[#5b6472]"
                  )}
                >
                  {label}
                  {count != null ? ` · ${count}` : ""}
                </button>
              ))}
            </div>
            {sessions.filter((s) => {
              const statusOk =
                inboxFilter === "needs"
                  ? s.status === "waiting"
                  : inboxFilter === "closed"
                    ? s.status === "closed"
                    : s.status !== "closed";
              if (!statusOk) return false;
              const q = inboxQuery.trim().toLowerCase();
              if (!q) return true;
              return [s.visitor_name, s.visitor_email, s.page_title, s.last_body]
                .join(" ")
                .toLowerCase()
                .includes(q);
            }).length === 0 ? (
              <p className="p-4 text-sm text-muted">No conversations in this view.</p>
            ) : (
              sessions
                .filter((s) => {
                  const statusOk =
                    inboxFilter === "needs"
                      ? s.status === "waiting"
                      : inboxFilter === "closed"
                        ? s.status === "closed"
                        : s.status !== "closed";
                  if (!statusOk) return false;
                  const q = inboxQuery.trim().toLowerCase();
                  if (!q) return true;
                  return [s.visitor_name, s.visitor_email, s.page_title, s.last_body]
                    .join(" ")
                    .toLowerCase()
                    .includes(q);
                })
                .map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  className={cn(
                    "block w-full border-b border-border px-3 py-3 text-left text-sm",
                    selectedId === s.id ? "bg-[#e6f2fa]" : "hover:bg-[#f4f6f7]"
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
                  <div className="truncate text-[13px] text-[#33404f]">
                    {s.last_body || s.page_title || "No messages yet"}
                  </div>
                  <div className="mt-1">
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", statusTone(s))}>
                      {statusLabel(s)}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
          <div className="flex min-h-[70vh] flex-col bg-white">
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
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", statusTone(selected))}>
                    {statusLabel(selected)}
                  </span>
                  {selected.enquiry_id ? (
                    <a
                      href={`/app/enquiries?open=${encodeURIComponent(selected.enquiry_id)}`}
                      className="text-xs text-[#007DC5] underline"
                    >
                      Linked enquiry
                    </a>
                  ) : null}
                  <div className="ml-auto flex gap-2">
                    <button
                      type="button"
                      className="btn-ghost"
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
                    {selected.status === "ai" ? (
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => setStatus("human")}
                        disabled={busy}
                      >
                        Take over
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setStatus("closed")}
                      disabled={busy || selected.status === "closed"}
                    >
                      Close chat
                    </button>
                  </div>
                </div>
                {selected.status === "waiting" ? (
                  <div className="flex items-center gap-3 border-b border-[#e7dcc2] bg-[#f6efe0] px-4 py-2 text-sm text-[#7a5a10]">
                    <span className="flex-1">
                      <strong>
                        {visitorLabel(selected)} asked for the team {waitAge(selected)} ago.
                      </strong>{" "}
                      The assistant has stopped replying.
                    </span>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={busy}
                      onClick={() => setStatus("human")}
                    >
                      Take over
                    </button>
                  </div>
                ) : null}
                <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-[#f4f6f7] p-4">
                  {messages.map((m) => {
                    const guided =
                      m.role === "visitor" ? guidedEnquiry(m.body) : null;
                    const when = formatMessageWhen(m.created_at);
                    return (
                      <div
                        key={m.id}
                        className={cn(
                          "flex max-w-[85%] flex-col gap-1",
                          m.role === "visitor"
                            ? "ml-auto items-end"
                            : m.role === "system"
                              ? "mx-auto w-full max-w-none items-center"
                              : "mr-auto items-start"
                        )}
                      >
                        {m.role === "system" ? null : (
                          <div className="text-xs text-[#5b6472]">
                            {messageWho(m)}
                            {when ? ` · ${when}` : ""}
                          </div>
                        )}
                        {m.role === "system" ? (
                          <div className="flex w-full items-center gap-3 text-[13px] text-[#5b6472]">
                            <span className="h-px flex-1 bg-[#e3e6e9]" />
                            <span>{stripChoiceTag(m.body)}</span>
                            <span className="h-px flex-1 bg-[#e3e6e9]" />
                          </div>
                        ) : guided ? (
                          <div className="w-full rounded-lg border border-[#e3e6e9] bg-white px-3.5 py-2.5 text-[15px] text-[#1f2937]">
                            <div className="mb-2 font-semibold text-[#0B2545]">
                              {guided.title}
                            </div>
                            <dl className="grid grid-cols-[minmax(0,140px)_1fr] gap-x-3 gap-y-1">
                              {guided.rows.map((row) => (
                                <div key={`${row.label}-${row.value}`} className="contents">
                                  <dt className="text-[#5b6472]">{row.label}</dt>
                                  <dd>{row.value}</dd>
                                </div>
                              ))}
                            </dl>
                          </div>
                        ) : (
                          <div
                            className={cn(
                              "rounded-lg px-3.5 py-2.5 text-[15px]",
                              m.role === "visitor"
                                ? "bg-[#0B2545] text-white"
                                : m.role === "staff"
                                  ? "border border-[#cfe5f5] bg-[#e6f2fa] text-[#0B2545]"
                                  : "border border-[#e3e6e9] bg-[#f4f6f7] text-[#0B2545]"
                            )}
                          >
                            {stripChoiceTag(m.body)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="border-t border-border p-3">
                  {selected.status === "closed" ? (
                    <p className="text-sm text-muted">
                      The visitor closed this chat, so it cannot be taken over.
                    </p>
                  ) : (
                    <div>
                      <textarea
                        className="field min-h-[72px]"
                        placeholder={
                          selected.status === "human"
                            ? "Reply as the team…"
                            : "Take over to reply as yourself"
                        }
                        value={reply}
                        disabled={selected.status !== "human"}
                        onChange={(e) => setReply(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void sendReply();
                          }
                        }}
                      />
                      <div className="mt-1 flex items-center justify-between text-xs text-[#5b6472]">
                        <span>Enter to send · Shift+Enter for a new line</span>
                        {selected.status === "human" ? (
                          <button
                            type="button"
                            className="btn-primary"
                            disabled={busy || !reply.trim()}
                            onClick={() => void sendReply()}
                          >
                            Send
                          </button>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          <aside className="max-h-[70vh] overflow-y-auto border-l border-[#e3e6e9] bg-white p-4 text-sm">
            {!selected ? (
              <p className="text-sm text-muted">Visitor details appear here.</p>
            ) : (
              (() => {
                const guided = [...messages]
                  .reverse()
                  .map((item) =>
                    item.role === "visitor" ? guidedEnquiry(item.body) : null
                  )
                  .find((item) => item != null);
                const enquiryType = /freight|cargo/i.test(guided?.title ?? "")
                  ? "Freight or cargo"
                  : /yacht/i.test(guided?.title ?? "")
                    ? "Yacht transport"
                    : guided?.title || "Not given";
                return (
                  <div className="space-y-4">
                    <section>
                      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5b6472]">
                        Visitor
                      </h2>
                      <dl className="mt-3 grid grid-cols-[80px_1fr] gap-y-2 text-sm">
                        <dt className="text-[#5b6472]">Name</dt>
                        <dd>{selected.visitor_name || "Not given"}</dd>
                        <dt className="text-[#5b6472]">Email</dt>
                        <dd className="break-words">{selected.visitor_email || "Not given"}</dd>
                        <dt className="text-[#5b6472]">Company</dt>
                        <dd>{selected.visitor_company || "Not given"}</dd>
                        <dt className="text-[#5b6472]">Based</dt>
                        <dd>
                          {guidedField(guided ?? null, (label) =>
                            label.includes("where are you based")
                          )}
                        </dd>
                      </dl>
                    </section>
                    <section className="border-t border-[#e3e6e9] pt-4">
                      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5b6472]">
                        Enquiry
                      </h2>
                      <dl className="mt-3 grid grid-cols-[80px_1fr] gap-y-2 text-sm">
                        <dt className="text-[#5b6472]">Type</dt>
                        <dd>{enquiryType}</dd>
                        <dt className="text-[#5b6472]">Yacht/Cargo</dt>
                        <dd>
                          {guidedField(
                            guided ?? null,
                            (label) =>
                              label.includes("make / model") ||
                              label.includes("what are you shipping")
                          )}
                        </dd>
                        <dt className="text-[#5b6472]">LOA</dt>
                        <dd>
                          {guidedField(guided ?? null, (label) =>
                            label.includes("length (loa)")
                          )}
                        </dd>
                        <dt className="text-[#5b6472]">From</dt>
                        <dd>
                          {guidedField(
                            guided ?? null,
                            (label) =>
                              label.includes("yacht now") ||
                              label.includes("origin") ||
                              label.includes("loading port")
                          )}
                        </dd>
                        <dt className="text-[#5b6472]">To</dt>
                        <dd>
                          {guidedField(guided ?? null, (label) =>
                            label.includes("destination")
                          )}
                        </dd>
                      </dl>
                      {selected.enquiry_id ? (
                        <a
                          href={`/app/enquiries?open=${encodeURIComponent(selected.enquiry_id)}`}
                          className="btn-secondary mt-4 w-full"
                        >
                          Open enquiry record
                        </a>
                      ) : (
                        <button type="button" className="btn-secondary mt-4 w-full" disabled>
                          Open enquiry record
                        </button>
                      )}
                    </section>
                    <section className="border-t border-[#e3e6e9] pt-4">
                      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5b6472]">
                        Source · staff only
                      </h2>
                      <dl className="mt-3 grid grid-cols-[80px_1fr] gap-y-2 text-sm">
                        <dt className="text-[#5b6472]">Page</dt>
                        <dd className="break-words">
                          {selected.page_title || selected.page_url || "Not recorded"}
                        </dd>
                        <dt className="text-[#5b6472]">Referrer</dt>
                        <dd className="break-words">{selected.referrer || "Not recorded"}</dd>
                        <dt className="text-[#5b6472]">Campaign</dt>
                        <dd>
                          {typeof selected.utm?.utm_campaign === "string" &&
                          selected.utm.utm_campaign
                            ? selected.utm.utm_campaign
                            : "None"}
                        </dd>
                      </dl>
                      <p className="mt-3 text-xs text-[#5b6472]">
                        Staff only. Not shown to the visitor.
                      </p>
                    </section>
                  </div>
                );
              })()
            )}
          </aside>
        </div>
      ) : null}

      {tab === "train" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="overflow-hidden rounded-lg border border-[#e3e6e9] bg-white">
            <div className="flex items-start justify-between gap-3 border-b border-[#e3e6e9] px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-[#0B2545]">
                  Tone and policies
                </h2>
                <p className="mt-1 text-sm text-[#5b6472]">
                  Empty guidance uses the recommended enquiry qualification SOP. Load it here to edit and save your own version.
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                  (settings?.guidance ?? "") !== savedGuidance ||
                    (settings?.greeting ?? "") !== savedGreeting
                    ? "border border-[#e7dcc2] bg-[#f6efe0] text-[#7a5a10]"
                    : "border border-[#cfe5f5] bg-[#e6f2fa] text-[#005f97]"
                )}
              >
                {(settings?.guidance ?? "") !== savedGuidance ||
                (settings?.greeting ?? "") !== savedGreeting
                  ? "Unsaved changes"
                  : !(settings?.guidance ?? "").trim() ||
                      settings?.guidance === DEFAULT_ENQUIRY_CHAT_GUIDANCE
                    ? "Recommended"
                    : "Custom"}
              </span>
            </div>
            <div className="space-y-3 px-6 py-5">
            <textarea
              className="field min-h-[220px] w-full text-base"
              value={settings?.guidance ?? ""}
              placeholder="Leave blank to use the recommended Peters & May enquiry guidance…"
              onChange={(e) =>
                setSettings((s) =>
                  s ? { ...s, guidance: e.target.value } : s
                )
              }
            />
            <label className="block text-sm text-[#5b6472]">Greeting</label>
            <input
              className="field w-full text-base"
              value={settings?.greeting ?? ""}
              onChange={(e) =>
                setSettings((s) =>
                  s ? { ...s, greeting: e.target.value } : s
                )
              }
            />
            <div className="flex max-w-[85%] flex-col gap-1">
              <div className="text-xs text-[#5b6472]">Peters & May assistant</div>
              <div className="rounded-lg border border-[#e3e6e9] bg-[#f4f6f7] px-3.5 py-2.5 text-[15px] text-[#0B2545]">
                {settings?.greeting?.trim() || DEFAULT_CHAT_GREETING}
              </div>
            </div>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-[#e3e6e9] bg-[#f4f6f7] px-6 py-3">
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
                className="btn-ghost disabled:opacity-50"
              >
                Restore recommended
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setTestUseDraft(true);
                    setTab("test");
                  }}
                >
                  Test changes
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
                  className="btn-primary disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
          <div className="overflow-hidden rounded-lg border border-[#e3e6e9] bg-white">
            <div className="border-b border-[#e3e6e9] px-6 py-4">
              <h2 className="text-lg font-semibold text-[#0B2545]">
                Knowledge base
              </h2>
              <p className="mt-1 text-sm text-[#5b6472]">
                Documents the assistant may quote, and the published pages it can read.
              </p>
            </div>
            <div className="space-y-4 px-6 py-5">
            <div className="overflow-x-auto text-sm">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs text-muted">
                    <th className="py-1 font-medium">Title</th>
                    <th className="py-1 font-medium">Updated</th>
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
                          onClick={() => {
                            setKbForm({
                              id: d.id,
                              title: d.title,
                              source_url: d.source_url,
                              body: d.body,
                            });
                            setKbOpen(true);
                          }}
                        >
                          {d.title}
                        </button>
                      </td>
                      <td className="py-2 text-[#5b6472]">
                        {formatDayMonth(d.updated_at)}
                      </td>
                      <td className="py-2">
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                            d.active
                              ? "border border-[#cfe5f5] bg-[#e6f2fa] text-[#005f97]"
                              : "border border-[#e3e6e9] bg-[#f4f6f7] text-[#5b6472]"
                          )}
                        >
                          {d.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setKbForm({ id: "", title: "", source_url: "", body: "" });
                setKbOpen(true);
              }}
            >
              Add document
            </button>
            <RecordDrawer
              open={kbOpen}
              onClose={() => setKbOpen(false)}
              title={kbForm.id ? "Edit document" : "Add document"}
              footer={
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveKb().then(() => setKbOpen(false))}
                    className="btn-primary"
                  >
                    {kbForm.id ? "Update document" : "Add document"}
                  </button>
                  {kbForm.id ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void removeKb(kbForm.id)}
                      className="btn-secondary"
                    >
                      Delete document
                    </button>
                  ) : null}
                </div>
              }
            >
              <div className="space-y-3">
                <input
                  className="field"
                  placeholder="Title"
                  value={kbForm.title}
                  onChange={(e) =>
                    setKbForm((f) => ({ ...f, title: e.target.value }))
                  }
                />
                <input
                  className="field"
                  placeholder="Source URL (optional)"
                  value={kbForm.source_url}
                  onChange={(e) =>
                    setKbForm((f) => ({ ...f, source_url: e.target.value }))
                  }
                />
                <textarea
                  className="field min-h-[160px]"
                  placeholder="Approved public content"
                  value={kbForm.body}
                  onChange={(e) =>
                    setKbForm((f) => ({ ...f, body: e.target.value }))
                  }
                />
              </div>
            </RecordDrawer>
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
        </div>
      ) : null}

      {tab === "test" ? (
        <div className="mx-auto w-full max-w-[380px] overflow-hidden rounded-xl border border-[#e3e6e9] bg-white shadow-[0_12px_32px_rgba(29,30,31,0.14)]">
          <div className="bg-[#0B2545] px-4 py-3 text-white">
            <div className="font-semibold">How can we help?</div>
            <div className="text-xs text-white/80">Test · not a live visitor</div>
          </div>
          <div className="flex flex-wrap gap-2 border-b border-[#e3e6e9] px-3 py-2">
            {[
              "Is there a sailing for Fort Lauderdale?",
              "I need to ship a yacht",
              "Where are your offices?",
            ].map((q) => (
              <button
                key={q}
                type="button"
                className="rounded-md border border-[#c7ccd1] bg-white px-3 py-2 text-left text-sm font-semibold text-[#005f97]"
                onClick={() => void runTest(q)}
              >
                {q}
              </button>
            ))}
          </div>
          <div className="flex min-h-[320px] flex-col gap-3 bg-white p-3">
            {testLog.length === 0 ? (
              <p className="text-sm text-[#5b6472]">Ask a test question…</p>
            ) : (
              testLog.map((m, i) => (
                <div
                  key={`${i}-${m.role}`}
                  className={cn(
                    "flex max-w-[85%] flex-col gap-1",
                    m.role === "visitor" ? "ml-auto items-end" : "mr-auto items-start"
                  )}
                >
                  <div className="text-xs text-[#5b6472]">
                    {m.role === "visitor" ? "You" : "Peters & May assistant"}
                  </div>
                  <div
                    className={cn(
                      "rounded-xl px-3 py-2 text-base",
                      m.role === "visitor"
                        ? "bg-[#0B2545] text-white"
                        : "bg-[#f4f6f7] text-[#1f2937]"
                    )}
                  >
                    {stripChoiceTag(m.body)}
                  </div>
                  {m.role === "assistant" && m.choices && m.choices.length > 1 ? (
                    <div className="flex flex-wrap gap-2">
                      {m.choices.map((choice) => (
                        <button
                          key={choice}
                          type="button"
                          className="rounded-md border border-[#c7ccd1] bg-white px-3 py-2 text-sm font-semibold text-[#005f97]"
                          onClick={() => void runTest(choice)}
                        >
                          {choice}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
          <div className="flex gap-2 border-t border-[#e3e6e9] p-3">
            <input
              className="field min-h-11 flex-1 text-base"
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
              className="btn-primary min-h-11 min-w-11 disabled:opacity-50"
            >
              Send
            </button>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-[#e3e6e9] px-3 py-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setTestLog([]);
                setTestSessionId("");
              }}
            >
              Start over
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setTestUseDraft((v) => !v)}
            >
              {testUseDraft ? "Using unsaved guidance" : "Use unsaved guidance"}
            </button>
          </div>
        </div>
      ) : null}

      {tab === "deploy" ? (
        <div className="grid max-w-4xl gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-[#e3e6e9] bg-white p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-[#0B2545]">
                  Live on the website
                </h2>
                <p className="mt-1 text-sm text-[#5b6472]">
                  Visitors see the assistant when this is on. It saves straight away, and it is separate from guidance and the handover note.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(settings?.deployed)}
                aria-label="Live on the website"
                disabled={busy || !settings}
                onClick={() =>
                  void saveSettings({ deployed: !settings?.deployed })
                }
                className={cn(
                  "relative h-7 w-12 shrink-0 rounded-full disabled:opacity-50",
                  settings?.deployed ? "bg-[#007DC5]" : "bg-[#c7ccd1]"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-6 w-6 rounded-full bg-white",
                    settings?.deployed ? "left-5" : "left-0.5"
                  )}
                />
              </button>
            </div>
          </section>
          <section className="rounded-xl border border-[#e3e6e9] bg-white p-4">
            <h2 className="text-base font-semibold text-[#0B2545]">
              Before you go live
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-[#1f2937]">
              <li>
                {siteKeyConfigured ? "Done" : "Check"} — site key is set
              </li>
              <li>
                {settings?.deployed ? "Done" : "Check"} — live answers are on
              </li>
              <li>Check — plugin is active on the website</li>
              <li>Check — HubSpot chat is turned off</li>
            </ul>
          </section>
          <section className="space-y-3 rounded-xl border border-[#e3e6e9] bg-white p-4 lg:col-span-2">
            <h2 className="text-base font-semibold text-[#0B2545]">
              Handover
            </h2>
            <label className="block text-sm text-[#5b6472]">
              Office hours note, shown when someone asks for the team
            </label>
            <textarea
              className="field min-h-[80px] w-full text-base"
              value={settings?.office_hours_note ?? ""}
              onChange={(e) =>
                setSettings((s) =>
                  s ? { ...s, office_hours_note: e.target.value } : s
                )
              }
            />
            <label className="block text-sm text-[#5b6472]">
              Notify email. Quotes and leads come here first. Office routing stays off.
            </label>
            <input
              className="field w-full text-base"
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
              className="btn-primary disabled:opacity-50"
            >
              Save handover
            </button>
            <p className="text-sm text-[#5b6472]">
              Leads also land in Hub Enquiries, Website chat, and mirror to the Portal.
            </p>
          </section>
        </div>
      ) : null}

      {tab === "analyze" ? (
        <div className="space-y-4">
          <div className="inline-flex rounded-lg bg-[#f4f6f7] p-1 text-sm font-semibold">
            {(
              [
                ["30", "Last 30 days"],
                ["90", "90 days"],
                ["all", "All time"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setInsightRange(id)}
                className={cn(
                  "rounded-md px-3 py-1.5",
                  insightRange === id
                    ? "bg-white text-[#0B2545]"
                    : "text-[#5b6472]"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {!insights ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {[0, 1, 2].map((tile) => (
                <div
                  key={tile}
                  className="h-28 animate-pulse rounded-lg border border-[#e3e6e9] bg-[#f4f6f7]"
                />
              ))}
            </div>
          ) : (
            <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Leads captured", insights.with_lead, "Chats that left an email"],
              [
                "Lead rate",
                insights.total_sessions
                  ? `${Math.round((insights.with_lead / insights.total_sessions) * 100)}%`
                  : "0%",
                "Leads ÷ conversations",
              ],
              ["Asked for the team", `${insights.handoff_rate}%`, "Of all conversations"],
              ["Waiting now", insights.waiting, "Open in Inbox"],
            ].map(([label, value, hint]) =>
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
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5b6472]">
                    {label}
                  </div>
                  <div className="mt-2 font-display text-[44px] font-semibold leading-none text-[#9a6b13]">
                    {value}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-[#005f97]">{hint}</div>
                </button>
              ) : (
                <div
                  key={String(label)}
                  className="rounded-lg border border-border bg-white p-4"
                >
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5b6472]">
                    {label}
                  </div>
                  <div className="mt-2 font-display text-[44px] font-semibold leading-none text-[#0B2545]">
                    {value}
                  </div>
                  <div className="mt-2 text-sm text-[#5b6472]">{hint}</div>
                </div>
              )
            )}
          </div>
          <div className="rounded-lg border border-[#e3e6e9] bg-white p-5">
            <div className="mb-3 font-semibold text-[#0B2545]">
              From conversation to lead
            </div>
            {(
              [
                ["Conversations", insights.total_sessions, "#0B2545"],
                [
                  "Asked for the team",
                  Math.round((insights.handoff_rate / 100) * insights.total_sessions),
                  "#1b3a5b",
                ],
                ["Lead captured", insights.with_lead, "#007DC5"],
              ] as const
            ).map(([label, count, color]) => (
              <div
                key={label}
                className="mb-2 grid grid-cols-[170px_1fr_48px] items-center gap-3 text-sm"
              >
                <span>{label}</span>
                <div
                  className="h-5 rounded-sm"
                  style={{
                    width: `${insights.total_sessions ? Math.max(4, Math.round((Number(count) / insights.total_sessions) * 100)) : 0}%`,
                    background: color,
                  }}
                />
                <span className="text-right font-semibold">{count}</span>
              </div>
            ))}
            <p className="mt-2 text-sm text-[#5b6472]">
              Leads can exceed handoffs because the guided quote form captures email without asking for the team.
            </p>
          </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
