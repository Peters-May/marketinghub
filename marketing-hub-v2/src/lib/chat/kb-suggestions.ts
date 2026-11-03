import { createServiceClient } from "@/lib/supabase/admin";
import { uid } from "@/lib/utils";

function questionKey(question: string) {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

export type ChatKbSuggestion = {
  id: string;
  question_key: string;
  question: string;
  sample_answer: string;
  hit_count: number;
  status: "pending" | "approved" | "dismissed";
  last_session_id: string | null;
  ready_at: string | null;
  created_at: string;
  updated_at: string;
};

function rowToSuggestion(row: Record<string, unknown>): ChatKbSuggestion {
  const status =
    row.status === "approved" || row.status === "dismissed"
      ? row.status
      : "pending";
  return {
    id: String(row.id),
    question_key: String(row.question_key ?? ""),
    question: String(row.question ?? ""),
    sample_answer: String(row.sample_answer ?? ""),
    hit_count: Number(row.hit_count ?? 1) || 1,
    status,
    last_session_id:
      typeof row.last_session_id === "string" ? row.last_session_id : null,
    ready_at: typeof row.ready_at === "string" ? row.ready_at : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

/** Log an unanswered / low-confidence question for staff review. */
export async function recordChatKbMiss(input: {
  question: string;
  sessionId?: string;
}): Promise<void> {
  const key = questionKey(input.question);
  if (key.length < 8) return;
  const supabase = createServiceClient();
  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from("chat_kb_suggestions")
    .select("*")
    .eq("question_key", key)
    .maybeSingle();
  if (existing) {
    await supabase
      .from("chat_kb_suggestions")
      .update({
        hit_count: Number(existing.hit_count ?? 1) + 1,
        last_session_id: input.sessionId ?? existing.last_session_id,
        updated_at: now,
        ready_at: existing.ready_at ?? now,
      })
      .eq("id", existing.id);
    return;
  }
  await supabase.from("chat_kb_suggestions").insert({
    id: uid("kbs"),
    question_key: key,
    question: input.question.trim().slice(0, 500),
    sample_answer: "",
    hit_count: 1,
    status: "pending",
    last_session_id: input.sessionId ?? null,
    ready_at: now,
    created_at: now,
    updated_at: now,
  });
}

export async function listChatKbSuggestions(status?: string) {
  const supabase = createServiceClient();
  let q = supabase
    .from("chat_kb_suggestions")
    .select("*")
    .order("hit_count", { ascending: false })
    .limit(100);
  if (status === "pending" || status === "approved" || status === "dismissed") {
    q = q.eq("status", status);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) =>
    rowToSuggestion(row as Record<string, unknown>)
  );
}

export async function updateChatKbSuggestion(
  id: string,
  patch: Partial<{
    status: "pending" | "approved" | "dismissed";
    sample_answer: string;
    question: string;
  }>
) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("chat_kb_suggestions")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToSuggestion(data as Record<string, unknown>) : null;
}
