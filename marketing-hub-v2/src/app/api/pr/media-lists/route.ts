import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireAdmin } from "@/lib/api";
import {
  createMediaList,
  deleteMediaList,
  listMediaLists,
  updateMediaList,
} from "@/lib/data/repos";
import type { MediaList } from "@/lib/types";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  return jsonOk({ media_lists: await listMediaLists() });
}

export async function POST(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await request.json();
  const action = body.action as string | undefined;

  if (action === "delete") {
    await deleteMediaList(body.id);
    return jsonOk({ ok: true });
  }

  if (action === "update") {
    const updated = await updateMediaList(
      body.id,
      (body.patch ?? {}) as Partial<MediaList>
    );
    if (!updated) return jsonError("Not found", 404);
    return jsonOk({ item: updated });
  }

  const contactIds = Array.isArray(body.contact_ids)
    ? body.contact_ids.map(String)
    : [];

  const item = await createMediaList({
    name: String(body.name ?? "Untitled list").trim() || "Untitled list",
    description: String(body.description ?? ""),
    contact_ids: contactIds,
    list_kind:
      body.list_kind === "marketing" || body.list_kind === "mixed"
        ? body.list_kind
        : "press",
    source: String(body.source ?? "manual"),
  });
  return jsonOk({ item }, { status: 201 });
}
