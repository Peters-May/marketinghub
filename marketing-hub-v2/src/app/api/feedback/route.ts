import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { notifyMarketingAlert } from "@/lib/email/send-marketing-alert";

const FEEDBACK_TYPES = ["bug", "improvement", "idea", "other"] as const;
const FEEDBACK_PRIORITIES = ["low", "medium", "high"] as const;

function memberFeedbackPatch(patch: Record<string, unknown>) {
  const safe: Record<string, string | null> = {};
  if ("title" in patch) {
    if (typeof patch.title !== "string" || !patch.title.trim()) return null;
    safe.title = patch.title.trim().slice(0, 200);
  }
  if ("description" in patch) {
    if (patch.description == null) {
      safe.description = null;
    } else if (typeof patch.description !== "string") {
      return null;
    } else {
      safe.description = patch.description.trim().slice(0, 8000) || null;
    }
  }
  if ("type" in patch) {
    if (
      typeof patch.type !== "string" ||
      !FEEDBACK_TYPES.includes(patch.type as (typeof FEEDBACK_TYPES)[number])
    ) {
      return null;
    }
    safe.type = patch.type;
  }
  if ("priority" in patch) {
    if (
      typeof patch.priority !== "string" ||
      !FEEDBACK_PRIORITIES.includes(
        patch.priority as (typeof FEEDBACK_PRIORITIES)[number]
      )
    ) {
      return null;
    }
    safe.priority = patch.priority;
  }
  return safe;
}

async function getFeedbackItem(supabase: ReturnType<typeof createServiceClient>, id: string) {
  const { data, error } = await supabase
    .from("feedback")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  let query = supabase
    .from("feedback")
    .select("*")
    .order("created_at", { ascending: false });

  if (user.role !== "admin") {
    query = query.eq("submitted_by", user.id);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const supabase = createServiceClient();

  if (body.action === "update" && body.id) {
    const existing = await getFeedbackItem(supabase, body.id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    let patch = body.patch ?? {};
    if (user.role !== "admin") {
      if (existing.submitted_by !== user.id) {
        return NextResponse.json(
          { error: "You can only edit feedback you submitted" },
          { status: 403 }
        );
      }
      const safe = memberFeedbackPatch(
        patch && typeof patch === "object" ? patch : {}
      );
      if (!safe || !Object.keys(safe).length) {
        return NextResponse.json(
          { error: "Nothing to update" },
          { status: 400 }
        );
      }
      patch = safe;
    }
    const { error } = await supabase
      .from("feedback")
      .update(patch)
      .eq("id", body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "delete" && body.id) {
    const existing = await getFeedbackItem(supabase, body.id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const isOwner = existing.submitted_by === user.id;
    if (user.role !== "admin" && !isOwner) {
      return NextResponse.json(
        { error: "You can only delete feedback you submitted" },
        { status: 403 }
      );
    }
    const { error } = await supabase.from("feedback").delete().eq("id", body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase.from("feedback").insert({
    type: body.type,
    title: body.title,
    description: body.description ?? null,
    priority: body.priority ?? "medium",
    submitted_by: user.id,
    submitted_by_name: user.full_name ?? body.submitted_by_name ?? null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const feedbackType =
    typeof body.type === "string" && body.type.trim()
      ? body.type.trim()
      : undefined;
  notifyMarketingAlert({ kind: "feedback", subtype: feedbackType });
  return NextResponse.json({ ok: true });
}
