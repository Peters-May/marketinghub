import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireStaff } from "@/lib/api";
import {
  createTask,
  deleteTask,
  listTasks,
  updateTask,
} from "@/lib/data/repos";
import { ownerMatchesViewer } from "@/lib/identity/owners";
import type { HubTask } from "@/lib/types";

function ownsTask(
  task: { owner: string; owner_user_id?: string | null },
  user: { id: string; full_name: string }
) {
  return ownerMatchesViewer(task.owner, task.owner_user_id, {
    id: user.id,
    fullName: user.full_name,
  });
}

export async function GET(request: NextRequest) {
  const { user, error } = await requireStaff();
  if (error || !user) return error;
  const relatedType = request.nextUrl.searchParams.get("related_type") ?? undefined;
  const relatedId = request.nextUrl.searchParams.get("related_id") ?? undefined;
  const tasks = await listTasks(
    relatedType && relatedId ? { relatedType, relatedId } : undefined
  );
  const mine = request.nextUrl.searchParams.get("mine") === "1";
  return jsonOk({
    tasks:
      user.role === "admin" && !mine
        ? tasks
        : tasks.filter((task) => ownsTask(task, user)),
  });
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireStaff();
  if (error || !user) return error;
  try {
    const body = await request.json();
    const action = body.action as string | undefined;

    if (action === "update") {
      const existing = (await listTasks()).find((task) => task.id === body.id);
      if (!existing) return jsonError("Not found", 404);
      if (user.role !== "admin" && !ownsTask(existing, user)) {
        return jsonError("You can only update your own tasks", 403);
      }
      const patch: Partial<HubTask> = { ...(body.patch ?? {}) };
      if (user.role !== "admin") {
        delete patch.owner;
        delete patch.owner_user_id;
      }
      const updated = await updateTask(body.id, patch);
      if (!updated) return jsonError("Not found", 404);
      return jsonOk({ item: updated });
    }

    if (action === "delete") {
      const existing = (await listTasks()).find((task) => task.id === body.id);
      if (!existing) return jsonError("Not found", 404);
      if (user.role !== "admin" && !ownsTask(existing, user)) {
        return jsonError("You can only delete your own tasks", 403);
      }
      await deleteTask(body.id);
      return jsonOk({ ok: true });
    }

    const ownOnly = user.role !== "admin" || body.assign_to_me === true;
    const item = await createTask({
      title: body.title ?? "Untitled task",
      details: body.details ?? "",
      start_date: body.start_date || null,
      due_date: body.due_date || null,
      category: body.category ?? "",
      status: body.status ?? "todo",
      owner: ownOnly ? user.full_name : (body.owner ?? ""),
      owner_user_id: ownOnly ? user.id : null,
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
