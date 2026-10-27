import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireAdmin, requireStaff } from "@/lib/api";
import {
  createContent,
  deleteContent,
  listContent,
  savePressRelease,
  setContentPostShare,
  setNewsroomPlacement,
  updateContent,
  withContentPlanableDefaults,
} from "@/lib/data/repos";
import { postSharePath } from "@/lib/social/post-share";
import {
  isSocialContentItem,
  normalizeChannels,
} from "@/lib/data/normalize";
import { contentVisibleToMember } from "@/lib/social/suggest";
import {
  pushContentToPlanable,
  removeContentFromPlanable,
  shouldPushSocialToPlanable,
} from "@/lib/planable/sync";
import type { ContentItem } from "@/lib/types";
import {
  loadOwnerDirectory,
  matchOwnerUserId,
} from "@/lib/identity/owners";
import {
  isReleaseEditorStatus,
  plainReleaseField,
  pressReleaseDate,
  pressReleaseSaveError,
} from "@/lib/pr/release-document";
import {
  renderBlocksHtml,
  sanitizePressReleaseDocument,
  seedReleaseDocument,
} from "@/lib/pr/release-blocks";
import { normalizeRichTextStorage } from "@/lib/sanitize";

async function maybePushPlanable(
  item: ContentItem
): Promise<{ item: ContentItem; planableSyncError?: string }> {
  if (!shouldPushSocialToPlanable(item)) {
    return { item };
  }
  const result = await pushContentToPlanable(item);
  if (result.error) {
    console.error("[planable] push failed", {
      id: item.id,
      status: item.status,
      error: result.error,
    });
  }
  return {
    item: result.item,
    ...(result.error ? { planableSyncError: result.error } : {}),
  };
}

export async function GET() {
  const { user, error } = await requireStaff();
  if (error) return error;
  const content = await listContent();
  if (user.role !== "admin") {
    return jsonOk({ content: contentVisibleToMember(content, user.id) });
  }
  return jsonOk({ content });
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireAdmin();
  if (error) return error;
  const body = await request.json();
  const action = body.action as string | undefined;

  if (action === "save_press_release") {
    const title = plainReleaseField(body.title, 240);
    const dueDate = pressReleaseDate(body.due_date);
    const status = isReleaseEditorStatus(body.status) ? body.status : body.status;
    const saveError = pressReleaseSaveError({ title, status, due_date: dueDate });
    if (saveError || !isReleaseEditorStatus(status)) {
      return jsonError(saveError || "Choose draft, ready, scheduled, or published.", 400);
    }
    const hasDocument =
      body.pr_document && typeof body.pr_document === "object";
    const document = hasDocument
      ? sanitizePressReleaseDocument(body.pr_document)
      : seedReleaseDocument(undefined, String(body.notes ?? ""));
    const notes = hasDocument
      ? renderBlocksHtml(document.blocks)
      : normalizeRichTextStorage(String(body.notes ?? ""));
    const item = await savePressRelease({
      id: typeof body.id === "string" && body.id.trim() ? body.id.trim() : undefined,
      title,
      caption: normalizeRichTextStorage(String(body.caption ?? "")),
      notes,
      due_date: dueDate,
      asset_url: plainReleaseField(body.asset_url, 2000),
      pr_location: plainReleaseField(body.pr_location, 80),
      pr_boilerplate: normalizeRichTextStorage(String(body.pr_boilerplate ?? "")),
      pr_contact: plainReleaseField(body.pr_contact, 1000),
      pr_document: document,
      status,
      owner: user.full_name || user.email,
      newsroom_title: plainReleaseField(body.newsroom_title, 150),
      placement: body.placement === "standalone" ? "standalone" : "newsroom",
      pin_homepage: body.pin_homepage === true,
      in_slider: body.in_slider === true,
    });
    if (!item) return jsonError("Press release not found", 404);
    return jsonOk({ item }, { status: body.id ? 200 : 201 });
  }

  if (action === "newsroom_placement") {
    const id = String(body.id ?? "");
    if (!id) return jsonError("id required", 400);
    const patch: {
      pin_homepage?: boolean;
      in_slider?: boolean;
      newsroom_name?: string;
    } = {};
    if (typeof body.pin_homepage === "boolean") {
      patch.pin_homepage = body.pin_homepage;
    }
    if (typeof body.in_slider === "boolean") patch.in_slider = body.in_slider;
    if (typeof body.newsroom_name === "string") {
      patch.newsroom_name = body.newsroom_name;
    }
    const item = await setNewsroomPlacement(id, patch);
    if (!item) return jsonError("Not found", 404);
    return jsonOk({ item });
  }

  if (action === "set_post_share") {
    const id = String(body.id ?? "");
    if (!id) return jsonError("id required", 400);
    const result = await setContentPostShare(id, body.enabled === true);
    if (!result) return jsonError("Not found", 404);
    return jsonOk({
      share_enabled: result.share_enabled,
      share_token: result.share_token,
      path: result.share_enabled ? postSharePath(result.share_token) : "",
    });
  }

  if (action === "update") {
    const existingList = await listContent();
    const existing = existingList.find((c) => c.id === body.id);
    if (!existing) return jsonError("Not found", 404);

    if (existing.status === "published") {
      return jsonError(
        "This post is published and locked in the Hub. You can only delete it.",
        403
      );
    }

    const patch = { ...(body.patch ?? {}) } as Record<string, unknown>;
    delete patch.share_token;
    delete patch.share_enabled;
    if (patch.status === "published") {
      return jsonError(
        "Publish only in Planable. Sync from Planable to mark it published in the Hub.",
        403
      );
    }
    if (patch.channel !== undefined) {
      patch.channel = normalizeChannels(patch.channel);
    }
    if (typeof patch.owner === "string" && patch.owner_user_id === undefined) {
      patch.owner_user_id = matchOwnerUserId(
        patch.owner,
        await loadOwnerDirectory()
      );
    }
    // User edits mark hub as source before push
    if (isSocialContentItem({ ...existing, ...patch } as ContentItem)) {
      patch.sync_source = "hub";
    }

    const updated = await updateContent(body.id, patch);
    if (!updated) return jsonError("Not found", 404);

    const pushed = await maybePushPlanable(withContentPlanableDefaults(updated));
    return jsonOk({
      item: pushed.item,
      ...(pushed.planableSyncError
        ? { planableSyncError: pushed.planableSyncError }
        : {}),
    });
  }

  if (action === "delete") {
    const existingList = await listContent();
    const existing = existingList.find((c) => c.id === body.id);
    if (existing) {
      const planable = await removeContentFromPlanable(
        withContentPlanableDefaults(existing)
      );
      if (!planable.ok) {
        return jsonError(
          planable.error ||
            "Failed to archive linked Planable post(s). Hub item was not deleted.",
          502
        );
      }
      await deleteContent(body.id);
      return jsonOk({ ok: true });
    }
    await deleteContent(body.id);
    return jsonOk({ ok: true });
  }

  if (body.status === "published") {
    return jsonError(
      "Publish only in Planable. Create as draft/scheduled in the Hub.",
      403
    );
  }

  const item = await createContent({
    title: body.title ?? "Untitled",
    channel: normalizeChannels(body.channel ?? body.channels ?? ["LinkedIn"]),
    content_type: body.content_type ?? "Social",
    owner: body.owner ?? "",
    owner_user_id: matchOwnerUserId(
      body.owner ?? "",
      await loadOwnerDirectory()
    ),
    due_date: body.due_date ?? null,
    deadline_date: body.deadline_date ?? null,
    status: body.status ?? "idea",
    category: body.category ?? "",
    priority: body.priority ?? "",
    website: body.website ?? "",
    caption: body.caption ?? "",
    theme_id: body.theme_id || null,
    planable_url: body.planable_url ?? "",
    planable_post_id: body.planable_post_id ?? "",
    planable_group_id: body.planable_group_id ?? "",
    planable_page_ids: Array.isArray(body.planable_page_ids)
      ? body.planable_page_ids.map(String)
      : [],
    last_synced_at: null,
    sync_source: "hub",
    asset_url: body.asset_url ?? "",
    notes: body.notes ?? "",
  });

  const pushed = await maybePushPlanable(withContentPlanableDefaults(item));
  return jsonOk(
    {
      item: pushed.item,
      ...(pushed.planableSyncError
        ? { planableSyncError: pushed.planableSyncError }
        : {}),
    },
    { status: 201 }
  );
}
