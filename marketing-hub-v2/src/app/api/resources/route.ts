import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireAdmin, requireStaff } from "@/lib/api";
import {
  createResource,
  deleteResource,
  listResources,
  updateResource,
} from "@/lib/data/repos";

export async function GET() {
  const { error } = await requireStaff();
  if (error) return error;
  return jsonOk({ resources: await listResources() });
}

export async function POST(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;
  const body = await request.json();
  const action = body.action as string | undefined;

  if (action === "update") {
    const updated = await updateResource(body.id, body.patch ?? {});
    if (!updated) return jsonError("Not found", 404);
    return jsonOk({ item: updated });
  }

  if (action === "delete") {
    await deleteResource(body.id);
    return jsonOk({ ok: true });
  }

  const item = await createResource({
    title: body.title ?? "Resource",
    description: body.description ?? "",
    url: body.url ?? "",
    category: body.category ?? "General",
  });
  return jsonOk({ item }, { status: 201 });
}
