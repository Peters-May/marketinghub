import { uid } from "@/lib/utils";
import {
  createServiceClient,
  hasServiceRoleKey,
} from "@/lib/supabase/admin";
import type {
  ChatKbDocument,
  ChatMessage,
  ChatMessageRole,
  ChatSession,
  ChatSessionStatus,
  ChatSettings,
} from "@/lib/types";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback = ""): string {
  if (value == null) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return fallback;
}

const STATUSES: ChatSessionStatus[] = ["ai", "waiting", "human", "closed"];
const ROLES: ChatMessageRole[] = ["visitor", "assistant", "staff", "system"];

function rowToSettings(row: Record<string, unknown>): ChatSettings {
  return {
    id: asString(row.id, "default"),
    deployed: Boolean(row.deployed),
    greeting: asString(row.greeting, "How can we help?"),
    guidance: asString(row.guidance),
    office_hours_note: asString(
      row.office_hours_note,
      "Our team typically replies during UK business hours."
    ),
    notify_email: asString(row.notify_email),
    updated_at: asString(row.updated_at),
  };
}

function rowToKb(row: Record<string, unknown>): ChatKbDocument {
  return {
    id: asString(row.id),
    title: asString(row.title),
    source_url: asString(row.source_url),
    body: asString(row.body),
    active: row.active !== false,
    sort_order: Number(row.sort_order) || 0,
    created_at: asString(row.created_at),
    updated_at: asString(row.updated_at),
  };
}

function rowToSession(row: Record<string, unknown>): ChatSession {
  const status = asString(row.status, "ai") as ChatSessionStatus;
  return {
    id: asString(row.id),
    status: STATUSES.includes(status) ? status : "ai",
    page_url: asString(row.page_url),
    page_title: asString(row.page_title),
    referrer: asString(row.referrer),
    utm: asRecord(row.utm),
    visitor_name: asString(row.visitor_name),
    visitor_email: asString(row.visitor_email),
    visitor_company: asString(row.visitor_company),
    enquiry_id: row.enquiry_id ? asString(row.enquiry_id) : null,
    assignee_email: asString(row.assignee_email),
    is_test: Boolean(row.is_test),
    last_message_at: asString(row.last_message_at),
    created_at: asString(row.created_at),
    updated_at: asString(row.updated_at),
  };
}

function rowToMessage(row: Record<string, unknown>): ChatMessage {
  const role = asString(row.role, "assistant") as ChatMessageRole;
  const sourcesRaw = row.sources;
  const sources = Array.isArray(sourcesRaw)
    ? sourcesRaw
        .map((s) => {
          const r = asRecord(s);
          return {
            title: asString(r.title),
            ...(asString(r.source_url)
              ? { source_url: asString(r.source_url) }
              : {}),
          };
        })
        .filter((s) => s.title)
    : [];
  return {
    id: asString(row.id),
    session_id: asString(row.session_id),
    role: ROLES.includes(role) ? role : "assistant",
    body: asString(row.body),
    author_name: asString(row.author_name),
    sources,
    created_at: asString(row.created_at),
  };
}

function requireService() {
  if (!hasServiceRoleKey()) {
    throw new Error("Supabase service role is required for chat");
  }
  return createServiceClient();
}

export async function getChatSettings(): Promise<ChatSettings> {
  const supabase = requireService();
  const { data, error } = await supabase
    .from("chat_settings")
    .select("*")
    .eq("id", "default")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    return {
      id: "default",
      deployed: false,
      greeting:
        "Hi, I can help get your enquiry to the right Peters & May team. What are you looking to move, or what can we help you with?",
      guidance: "",
      office_hours_note:
        "Our team typically replies during UK business hours.",
      notify_email: "",
      updated_at: new Date().toISOString(),
    };
  }
  return rowToSettings(data as Record<string, unknown>);
}

export async function updateChatSettings(
  patch: Partial<
    Pick<
      ChatSettings,
      | "deployed"
      | "greeting"
      | "guidance"
      | "office_hours_note"
      | "notify_email"
    >
  >
): Promise<ChatSettings> {
  const supabase = requireService();
  const now = new Date().toISOString();
  const current = await getChatSettings();
  const row = {
    id: "default",
    deployed:
      typeof patch.deployed === "boolean" ? patch.deployed : current.deployed,
    greeting:
      typeof patch.greeting === "string" ? patch.greeting : current.greeting,
    guidance:
      typeof patch.guidance === "string" ? patch.guidance : current.guidance,
    office_hours_note:
      typeof patch.office_hours_note === "string"
        ? patch.office_hours_note
        : current.office_hours_note,
    notify_email:
      typeof patch.notify_email === "string"
        ? patch.notify_email
        : current.notify_email,
    updated_at: now,
  };
  const { data, error } = await supabase
    .from("chat_settings")
    .upsert(row, { onConflict: "id" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return rowToSettings(data as Record<string, unknown>);
}

export async function listKbDocuments(opts?: {
  activeOnly?: boolean;
}): Promise<ChatKbDocument[]> {
  const supabase = requireService();
  let q = supabase
    .from("chat_kb_documents")
    .select("*")
    .order("sort_order", { ascending: true });
  if (opts?.activeOnly) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => rowToKb(r as Record<string, unknown>));
}

export async function upsertKbDocument(
  input: Partial<ChatKbDocument> & { title: string; body: string }
): Promise<ChatKbDocument> {
  const supabase = requireService();
  const now = new Date().toISOString();
  const id = input.id?.trim() || uid("kb");
  const row = {
    id,
    title: input.title.trim(),
    source_url: (input.source_url ?? "").trim(),
    body: input.body.trim(),
    active: input.active !== false,
    sort_order: input.sort_order ?? 100,
    updated_at: now,
    ...(input.id ? {} : { created_at: now }),
  };
  const { data, error } = await supabase
    .from("chat_kb_documents")
    .upsert(row, { onConflict: "id" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return rowToKb(data as Record<string, unknown>);
}

export async function deleteKbDocument(id: string): Promise<void> {
  const supabase = requireService();
  const { error } = await supabase
    .from("chat_kb_documents")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function createChatSession(input: {
  page_url?: string;
  page_title?: string;
  referrer?: string;
  utm?: Record<string, unknown>;
  is_test?: boolean;
}): Promise<{ session: ChatSession; welcome: ChatMessage }> {
  const supabase = requireService();
  const settings = await getChatSettings();
  const now = new Date().toISOString();
  const id = uid("chat");
  const sessionRow = {
    id,
    status: "ai" as const,
    page_url: (input.page_url ?? "").trim().slice(0, 2000),
    page_title: (input.page_title ?? "").trim().slice(0, 500),
    referrer: (input.referrer ?? "").trim().slice(0, 2000),
    utm: input.utm ?? {},
    is_test: Boolean(input.is_test),
    last_message_at: now,
    created_at: now,
    updated_at: now,
  };
  const { data: sessionData, error: sessionError } = await supabase
    .from("chat_sessions")
    .insert(sessionRow)
    .select("*")
    .single();
  if (sessionError) throw new Error(sessionError.message);

  const welcomeBody =
    settings.greeting.trim() ||
    "How can we help? Ask a question, or speak to the team.";
  const msgId = uid("cmsg");
  const { data: msgData, error: msgError } = await supabase
    .from("chat_messages")
    .insert({
      id: msgId,
      session_id: id,
      role: "assistant",
      body: welcomeBody,
      sources: [],
      created_at: now,
    })
    .select("*")
    .single();
  if (msgError) throw new Error(msgError.message);

  return {
    session: rowToSession(sessionData as Record<string, unknown>),
    welcome: rowToMessage(msgData as Record<string, unknown>),
  };
}

export async function getChatSession(
  id: string
): Promise<ChatSession | null> {
  const supabase = requireService();
  const { data, error } = await supabase
    .from("chat_sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToSession(data as Record<string, unknown>) : null;
}

export async function updateChatSession(
  id: string,
  patch: Partial<{
    status: ChatSessionStatus;
    visitor_name: string;
    visitor_email: string;
    visitor_company: string;
    enquiry_id: string | null;
    assignee_email: string;
    last_message_at: string;
  }>
): Promise<ChatSession | null> {
  const supabase = requireService();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("chat_sessions")
    .update({ ...patch, updated_at: now })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToSession(data as Record<string, unknown>) : null;
}

/** Close abandoned open chats so the inbox does not fill with duplicate Visitors. */
export async function closeAbandonedChatSessions(opts: {
  keepSessionId: string;
  visitorEmail?: string;
}): Promise<number> {
  const supabase = requireService();
  const now = new Date().toISOString();
  const email = (opts.visitorEmail ?? "").trim().toLowerCase();

  let q = supabase
    .from("chat_sessions")
    .select("id, visitor_email, status")
    .in("status", ["ai", "waiting", "human"])
    .neq("id", opts.keepSessionId)
    .limit(50);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const toClose = (data ?? []).filter((row) => {
    const rowEmail = String(row.visitor_email ?? "")
      .trim()
      .toLowerCase();
    // Same email → always close older open threads.
    if (email && rowEmail && rowEmail === email) return true;
    // Anonymous abandoned AI threads (no email yet).
    if (!rowEmail && row.status === "ai") return true;
    return false;
  });

  if (toClose.length === 0) return 0;
  const ids = toClose.map((r) => String(r.id));
  const { error: updErr } = await supabase
    .from("chat_sessions")
    .update({ status: "closed", updated_at: now })
    .in("id", ids);
  if (updErr) throw new Error(updErr.message);
  return ids.length;
}

export async function listChatSessions(opts?: {
  status?: ChatSessionStatus | "open";
  limit?: number;
}): Promise<ChatSession[]> {
  const supabase = requireService();
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500);
  let q = supabase
    .from("chat_sessions")
    .select("*")
    .order("last_message_at", { ascending: false })
    .limit(limit);
  if (opts?.status === "open") {
    q = q.in("status", ["ai", "waiting", "human"]);
  } else if (opts?.status) {
    q = q.eq("status", opts.status);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => rowToSession(r as Record<string, unknown>));
}

export async function listChatMessages(
  sessionId: string,
  opts?: { after?: string }
): Promise<ChatMessage[]> {
  const supabase = requireService();
  let q = supabase
    .from("chat_messages")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (opts?.after) {
    q = q.gt("created_at", opts.after);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => rowToMessage(r as Record<string, unknown>));
}

export async function addChatMessage(input: {
  session_id: string;
  role: ChatMessageRole;
  body: string;
  sources?: ChatMessage["sources"];
  author_name?: string;
}): Promise<ChatMessage> {
  const supabase = requireService();
  const now = new Date().toISOString();
  const id = uid("cmsg");
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      id,
      session_id: input.session_id,
      role: input.role,
      body: input.body.trim(),
      author_name: (input.author_name ?? "").trim().slice(0, 80),
      sources: input.sources ?? [],
      created_at: now,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await supabase
    .from("chat_sessions")
    .update({ last_message_at: now, updated_at: now })
    .eq("id", input.session_id);

  return rowToMessage(data as Record<string, unknown>);
}

export async function getChatInsights(): Promise<{
  total_sessions: number;
  waiting: number;
  human: number;
  closed: number;
  with_lead: number;
  handoff_rate: number;
}> {
  const sessions = await listChatSessions({ limit: 500 });
  const total = sessions.length;
  const waiting = sessions.filter((s) => s.status === "waiting").length;
  const human = sessions.filter((s) => s.status === "human").length;
  const closed = sessions.filter((s) => s.status === "closed").length;
  const withLead = sessions.filter((s) => Boolean(s.enquiry_id)).length;
  const handed = sessions.filter(
    (s) => s.status === "waiting" || s.status === "human" || s.status === "closed"
  ).length;
  return {
    total_sessions: total,
    waiting,
    human,
    closed,
    with_lead: withLead,
    handoff_rate: total ? Math.round((handed / total) * 100) : 0,
  };
}
