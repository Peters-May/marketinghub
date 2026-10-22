import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireAdmin } from "@/lib/api";
import {
  createTask,
  deleteTask,
  listTasks,
  updateTask,
} from "@/lib/data/repos";

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;
  const relatedType = request.nextUrl.searchParams.get("related_type") ?? undefined;
  const relatedId = request.nextUrl.searchParams.get("related_id") ?? undefined;
  return jsonOk({
    tasks: await listTasks(
      relatedType && relatedId ? { relatedType, relatedId } : undefined
    ),
  });
}

export async function POST(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;
  try {
    const body = await request.json();
    const action = body.action as string | undefined;

    if (action === "update") {
      const updated = await updateTask(body.id, body.patch ?? {});
      if (!updated) return jsonError("Not found", 404);
      return jsonOk({ item: updated });
    }

    if (action === "delete") {
      await deleteTask(body.id);
      return jsonOk({ ok: true });
    }

    const item = await createTask({
      title: body.title ?? "Untitled task",
      details: body.details ?? "",
      start_date: body.start_date || null,
      due_date: body.due_date || null,
      category: body.category ?? "",
      status: body.status ?? "todo",
      owner: body.owner ?? "",
      related_type: body.related_type || "",
      related_id: body.related_id || null,
    });
    return jsonOk({ item }, { status: 201 });
  } catch (err) {
    console.error("[api/tasks] POST failed", err);
    return jsonError(
      err instanceof Error ? err.message : "Failed to save task",
      500
    );
  }
}
