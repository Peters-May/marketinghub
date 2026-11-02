import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireStaff } from "@/lib/api";
import { hasSupabaseConfig } from "@/lib/auth/config";
import {
  addMediaFilesInSupabase,
  createMediaInSupabase,
  deleteMediaFileInSupabase,
  normalizeGalleryVisibility,
  renameMediaFileInSupabase,
  setCategoryShareEnabled,
  setGalleryFolderShareEnabled,
  setGallerySubfolderVisibility,
  softDeleteMediaInSupabase,
  updateMediaItemInSupabase,
} from "@/lib/supabase/media-list";

export const dynamic = "force-dynamic";

type UploadFile = {
  url: string;
  name: string;
  type?: string;
  size?: number | null;
};

function parseUploadFile(raw: unknown): UploadFile | null {
  if (!raw || typeof raw !== "object") return null;
  const f = raw as Record<string, unknown>;
  const url = typeof f.url === "string" ? f.url.trim() : "";
  if (!url) return null;
  return {
    url,
    name: typeof f.name === "string" ? f.name : "File",
    type: typeof f.type === "string" ? f.type : "",
    size: typeof f.size === "number" ? f.size : null,
  };
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireStaff();
  if (error) return error;
  if (!user) return jsonError("Unauthorized", 401);

  if (!hasSupabaseConfig()) {
    return jsonError("Supabase is not configured", 503);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const action = body.action as string | undefined;

  try {
    if (action === "delete") {
      const id = typeof body.id === "string" ? body.id : "";
      if (!id) return jsonError("id is required");
      await softDeleteMediaInSupabase(id, user.id);
      return jsonOk({ ok: true });
    }

    if (action === "update") {
      const id = typeof body.id === "string" ? body.id : "";
      if (!id) return jsonError("id is required");
      const item = await updateMediaItemInSupabase({
        id,
        actorId: user.id,
        name: typeof body.name === "string" ? body.name : undefined,
        public_title:
          typeof body.public_title === "string" ? body.public_title : undefined,
        notes: typeof body.notes === "string" ? body.notes : undefined,
        category:
          typeof body.category === "string" ? body.category : undefined,
        subfolder:
          typeof body.subfolder === "string" ? body.subfolder : undefined,
        document_link:
          typeof body.document_link === "string"
            ? body.document_link
            : undefined,
        visibility:
          typeof body.visibility === "string"
            ? normalizeGalleryVisibility(body.visibility)
            : undefined,
        division:
          typeof body.division === "string" ? body.division : undefined,
      });
      return jsonOk({ item });
    }

    if (action === "rename_file") {
      const id = typeof body.id === "string" ? body.id : "";
      const fileUrl = typeof body.fileUrl === "string" ? body.fileUrl : "";
      const newName = typeof body.newName === "string" ? body.newName : "";
      if (!id) return jsonError("id is required");
      if (!fileUrl) return jsonError("fileUrl is required");
      if (!newName.trim()) return jsonError("File name is required");
      const item = await renameMediaFileInSupabase({
        id,
        fileUrl,
        newName,
        actorId: user.id,
      });
      return jsonOk({ item });
    }

    if (action === "delete_file") {
      const id = typeof body.id === "string" ? body.id : "";
      const fileUrl = typeof body.fileUrl === "string" ? body.fileUrl : "";
      const fileIndex =
        typeof body.fileIndex === "number" ? body.fileIndex : undefined;
      if (!id) return jsonError("id is required");
      if (!fileUrl) return jsonError("fileUrl is required");
      const result = await deleteMediaFileInSupabase({
        id,
        fileUrl,
        fileIndex,
        actorId: user.id,
      });
      return jsonOk(result);
    }

    if (action === "add_files") {
      const id = typeof body.id === "string" ? body.id : "";
      if (!id) return jsonError("id is required");
      const files: UploadFile[] = [];
      if (Array.isArray(body.files)) {
        for (const entry of body.files) {
          const parsed = parseUploadFile(entry);
          if (parsed) files.push(parsed);
        }
      }
      const single = parseUploadFile(body.file);
      if (single) files.push(single);
      if (files.length === 0) return jsonError("At least one file is required");
      const item = await addMediaFilesInSupabase({
        id,
        files,
        actorId: user.id,
      });
      return jsonOk({ item });
    }

    if (action === "set_subfolder_visibility") {
      const subfolder =
        typeof body.subfolder === "string" ? body.subfolder : "";
      const rawVis =
        typeof body.visibility === "string" ? body.visibility : "";
      const visibility = normalizeGalleryVisibility(rawVis);
      const result = await setGallerySubfolderVisibility({
        subfolder,
        visibility,
        actorId: user.id,
      });
      return jsonOk({ ok: true, ...result, visibility });
    }

    if (action === "set_folder_share") {
      const subfolder =
        typeof body.subfolder === "string" ? body.subfolder : "";
      const enabled = body.enabled === true;
      const share = await setGalleryFolderShareEnabled({
        subfolder,
        enabled,
      });
      return jsonOk({ ok: true, share });
    }

    if (action === "set_category_share") {
      if (user.role !== "admin") return jsonError("Admin required", 403);
      const category = typeof body.category === "string" ? body.category : "";
      const enabled = body.enabled === true;
      const share = await setCategoryShareEnabled({ category, enabled });
      return jsonOk({ ok: true, share });
    }

    const name = typeof body.name === "string" ? body.name : "";
    if (!name.trim()) return jsonError("Name is required");

    const files: UploadFile[] = [];
    if (Array.isArray(body.files)) {
      for (const entry of body.files) {
        const parsed = parseUploadFile(entry);
        if (parsed) files.push(parsed);
      }
    }
    const single = parseUploadFile(body.file);
    if (single) files.push(single);

    const rawVis =
      typeof body.subfolder_visibility === "string"
        ? body.subfolder_visibility
        : "";
    const subfolder_visibility = normalizeGalleryVisibility(
      rawVis.trim() ? rawVis : "internal"
    );

    const rawItemVis =
      typeof body.visibility === "string" ? body.visibility : "";
    const visibility = rawItemVis.trim()
      ? normalizeGalleryVisibility(rawItemVis)
      : undefined;

    const item = await createMediaInSupabase({
      name,
      public_title:
        typeof body.public_title === "string" ? body.public_title : "",
      category: typeof body.category === "string" ? body.category : "Documents",
      subfolder: typeof body.subfolder === "string" ? body.subfolder : "",
      subfolder_visibility,
      visibility,
      division: typeof body.division === "string" ? body.division : "All",
      document_link:
        typeof body.document_link === "string" ? body.document_link : "",
      notes: typeof body.notes === "string" ? body.notes : "",
      status:
        typeof body.status === "string" ? body.status : "Internal Resource",
      files: files.length > 0 ? files : undefined,
      actorId: user.id,
    });

    return jsonOk({ item }, { status: 201 });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed", 400);
  }
}
