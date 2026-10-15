import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireStaff } from "@/lib/api";
import {
  createTheme,
  createThemeMainWithContent,
  createThemeOffshoot,
  deleteTheme,
  deleteThemeMain,
  deleteThemeOffshoot,
  ensureThemeMainContentLink,
  listContent,
  listThemeMains,
  listThemeOffshoots,
  listThemes,
  updateContent,
  updateTheme,
  updateThemeMain,
  updateThemeOffshoot,
} from "@/lib/data/repos";
import {
  formatChannels,
  normalizeChannels,
  parseChannels,
} from "@/lib/data/normalize";

export async function GET() {
  const { error } = await requireStaff();
  if (error) return error;
  const [themes, mains, offshoots, content] = await Promise.all([
    listThemes(),
    listThemeMains(),
    listThemeOffshoots(),
    listContent(),
  ]);
  return jsonOk({ themes, mains, offshoots, content });
}

export async function POST(request: NextRequest) {
  const { error } = await requireStaff();
  if (error) return error;
  try {
    return await handleThemesPost(request);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to save theme data";
    console.error("[api/themes] POST failed", err);
    return jsonError(message, 500);
  }
}

async function handleThemesPost(request: NextRequest) {
  const body = await request.json();
  const action = body.action as string | undefined;
  const entity = body.entity as "theme" | "main" | "offshoot" | undefined;

  if (action === "ensureContent") {
    const linked = await ensureThemeMainContentLink(body.id);
    if (!linked) return jsonError("Not found", 404);
    return jsonOk(linked);
  }

  if (action === "update") {
    if (entity === "theme") {
      const item = await updateTheme(body.id, body.patch ?? {});
      if (!item) return jsonError("Not found", 404);
      return jsonOk({ item });
    }
    if (entity === "main") {
      const item = await updateThemeMain(body.id, body.patch ?? {});
      if (!item) return jsonError("Not found", 404);
      let content = null;
      if (item.content_id && body.patch) {
        const sync: Record<string, unknown> = {};
        if (body.patch.title !== undefined) sync.title = body.patch.title;
        if (body.patch.channel !== undefined) {
          sync.channel = normalizeChannels(body.patch.channel);
        }
        if (body.patch.owner !== undefined) sync.owner = body.patch.owner;
        if (body.patch.status !== undefined) sync.status = body.patch.status;
        if (body.patch.notes !== undefined) sync.notes = body.patch.notes;
        if (Object.keys(sync).length > 0) {
          content = await updateContent(item.content_id, sync);
        }
      }
      return jsonOk({ item, ...(content ? { content } : {}) });
    }
    if (entity === "offshoot") {
      const item = await updateThemeOffshoot(body.id, body.patch ?? {});
      if (!item) return jsonError("Not found", 404);
      return jsonOk({ item });
    }
    return jsonError("Unknown entity");
  }

  if (action === "updateContent") {
    const patch = { ...(body.patch ?? {}) } as Record<string, unknown>;
    if (patch.channel !== undefined) {
      patch.channel = normalizeChannels(patch.channel);
    }
    const content = await updateContent(body.id, patch);
    if (!content) return jsonError("Not found", 404);
    const mains = await listThemeMains();
    const main = mains.find((m) => m.content_id === content.id);
    const syncedMain = main
      ? await updateThemeMain(main.id, {
          title: content.title,
          channel:
            formatChannels(content.channel) ||
            parseChannels(content.channel)[0] ||
            "",
          owner: content.owner,
          status: content.status,
          notes: content.notes,
        })
      : null;
    return jsonOk({
      content,
      main: syncedMain,
      mainId: syncedMain?.id ?? main?.id ?? null,
    });
  }

  if (action === "delete") {
    if (entity === "theme") await deleteTheme(body.id);
    else if (entity === "main") await deleteThemeMain(body.id);
    else if (entity === "offshoot") await deleteThemeOffshoot(body.id);
    else return jsonError("Unknown entity");
    return jsonOk({ ok: true });
  }

  if (entity === "main") {
    const created = await createThemeMainWithContent({
      theme_id: body.theme_id,
      title: body.title ?? "Main content",
      channel: body.channel ?? "",
      owner: body.owner ?? "",
      status: body.status ?? "idea",
      notes: body.notes ?? "",
      content_type: body.content_type ?? "Editorial",
    });
    if (!created) {
      return jsonError("Theme not found or theme_id missing", 400);
    }
    return jsonOk(created, { status: 201 });
  }

  if (entity === "offshoot") {
    const item = await createThemeOffshoot({
      main_content_id: body.main_content_id,
      title: body.title ?? "Offshoot",
      channel: body.channel ?? "",
      owner: body.owner ?? "",
      status: body.status ?? "idea",
      notes: body.notes ?? "",
    });
    return jsonOk({ item }, { status: 201 });
  }

  const item = await createTheme({
    title: body.title ?? "Theme",
    quarter: body.quarter ?? "Q1",
    year: body.year ?? new Date().getFullYear(),
    status: body.status ?? "upcoming",
    summary: body.summary ?? "",
  });
  return jsonOk({ item }, { status: 201 });
}
