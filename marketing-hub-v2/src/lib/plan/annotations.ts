import { uid } from "@/lib/utils";
import { readStore, updateStore } from "@/lib/store/local";
import type { PlanAnnotation, PlanAnnotationReply } from "@/lib/types";

const PLAN_ID = "2027";
const MAX_ANNOTATIONS = 500;
const MAX_BODY = 4000;
const MAX_QUOTE = 2000;
const MAX_CONTEXT = 80;
const MAX_NAME = 120;

function nowIso() {
  return new Date().toISOString();
}

function cleanText(value: unknown, max: number) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function normalizePlanAnnotation(row: unknown): PlanAnnotation | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const id = String(r.id ?? "").trim();
  const quote = cleanText(r.quote, MAX_QUOTE);
  const body = cleanText(r.body, MAX_BODY);
  const author_name = cleanText(r.author_name, MAX_NAME);
  if (!id || !quote || !body || !author_name) return null;

  const repliesRaw = Array.isArray(r.replies) ? r.replies : [];
  const replies: PlanAnnotationReply[] = [];
  for (const item of repliesRaw) {
    if (!item || typeof item !== "object") continue;
    const reply = item as Record<string, unknown>;
    const replyId = String(reply.id ?? "").trim();
    const replyBody = cleanText(reply.body, MAX_BODY);
    const replyName = cleanText(reply.author_name, MAX_NAME);
    if (!replyId || !replyBody || !replyName) continue;
    replies.push({
      id: replyId,
      body: replyBody,
      author_name: replyName,
      author_user_id: String(reply.author_user_id ?? "").trim(),
      created_at: String(reply.created_at ?? nowIso()),
    });
  }

  return {
    id,
    plan_id: String(r.plan_id ?? PLAN_ID).trim() || PLAN_ID,
    quote,
    prefix: cleanText(r.prefix, MAX_CONTEXT),
    suffix: cleanText(r.suffix, MAX_CONTEXT),
    section_id: String(r.section_id ?? "").trim(),
    body,
    author_name,
    author_user_id: String(r.author_user_id ?? "").trim(),
    created_at: String(r.created_at ?? nowIso()),
    resolved_at:
      r.resolved_at == null || r.resolved_at === ""
        ? null
        : String(r.resolved_at),
    replies,
  };
}

export async function listPlanAnnotations(
  planId = PLAN_ID
): Promise<PlanAnnotation[]> {
  const store = await readStore();
  return (store.plan_annotations ?? [])
    .map((row) => normalizePlanAnnotation(row))
    .filter((row): row is PlanAnnotation => !!row && row.plan_id === planId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function createPlanAnnotation(input: {
  plan_id?: string;
  quote: string;
  prefix?: string;
  suffix?: string;
  section_id?: string;
  body: string;
  author_name: string;
  author_user_id?: string;
}): Promise<PlanAnnotation | null> {
  const annotation = normalizePlanAnnotation({
    id: uid("pann"),
    plan_id: input.plan_id || PLAN_ID,
    quote: input.quote,
    prefix: input.prefix ?? "",
    suffix: input.suffix ?? "",
    section_id: input.section_id ?? "",
    body: input.body,
    author_name: input.author_name,
    author_user_id: input.author_user_id ?? "",
    created_at: nowIso(),
    resolved_at: null,
    replies: [],
  });
  if (!annotation) return null;

  await updateStore((s) => {
    if (!s.plan_annotations) s.plan_annotations = [];
    s.plan_annotations.push(annotation);
    if (s.plan_annotations.length > MAX_ANNOTATIONS) {
      s.plan_annotations = s.plan_annotations.slice(-MAX_ANNOTATIONS);
    }
  });
  return annotation;
}

export async function replyToPlanAnnotation(input: {
  id: string;
  body: string;
  author_name: string;
  author_user_id?: string;
}): Promise<PlanAnnotation | null> {
  const body = cleanText(input.body, MAX_BODY);
  const author_name = cleanText(input.author_name, MAX_NAME);
  if (!body || !author_name) return null;

  let updated: PlanAnnotation | null = null;
  await updateStore((s) => {
    if (!s.plan_annotations) s.plan_annotations = [];
    const idx = s.plan_annotations.findIndex((row) => row.id === input.id);
    if (idx === -1) return;
    const current = normalizePlanAnnotation(s.plan_annotations[idx]);
    if (!current) return;
    const reply: PlanAnnotationReply = {
      id: uid("preply"),
      body,
      author_name,
      author_user_id: String(input.author_user_id ?? "").trim(),
      created_at: nowIso(),
    };
    updated = { ...current, replies: [...current.replies, reply] };
    s.plan_annotations[idx] = updated;
  });
  return updated;
}

export async function setPlanAnnotationResolved(input: {
  id: string;
  resolved: boolean;
}): Promise<PlanAnnotation | null> {
  let updated: PlanAnnotation | null = null;
  await updateStore((s) => {
    if (!s.plan_annotations) s.plan_annotations = [];
    const idx = s.plan_annotations.findIndex((row) => row.id === input.id);
    if (idx === -1) return;
    const current = normalizePlanAnnotation(s.plan_annotations[idx]);
    if (!current) return;
    updated = {
      ...current,
      resolved_at: input.resolved ? nowIso() : null,
    };
    s.plan_annotations[idx] = updated;
  });
  return updated;
}
