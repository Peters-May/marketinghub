import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireStaff } from "@/lib/api";
import {
  createAward,
  deleteAward,
  listAwards,
  updateAward,
} from "@/lib/data/repos";

export async function GET() {
  const { error } = await requireStaff();
  if (error) return error;
  return jsonOk({ awards: await listAwards() });
}

export async function POST(request: NextRequest) {
  const { error } = await requireStaff();
  if (error) return error;
  const body = await request.json();
  const action = body.action as string | undefined;

  if (action === "update") {
    const updated = await updateAward(body.id, body.patch ?? {});
    if (!updated) return jsonError("Not found", 404);
    return jsonOk({ item: updated });
  }

  if (action === "delete") {
    await deleteAward(body.id);
    return jsonOk({ ok: true });
  }

  const item = await createAward({
    title: body.title ?? "Untitled award",
    organisation: body.organisation ?? "",
    category: body.category ?? "",
    year: Number(body.year) || new Date().getFullYear(),
    status: body.status ?? "watching",
    submission_deadline: body.submission_deadline || null,
    ceremony_at: body.ceremony_at || null,
    owner: body.owner ?? "",
    event_id: body.event_id || null,
    deadline_verified: body.deadline_verified === true,
    parent_id: body.parent_id || null,
    notes: body.notes ?? "",
  });
  return jsonOk({ item }, { status: 201 });
}
