import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireStaff } from "@/lib/api";
import {
  createContent,
  deleteContent,
  listContent,
  updateContent,
} from "@/lib/data/repos";
import {
  canReviseOwnIdea,
  parseSuggestChannels,
  safeAssetUrls,
  suggestText,
} from "@/lib/social/suggest";
import type { ContentItem } from "@/lib/types";

export const dynamic = "force-dynamic";

function suggestionFields(body: Record<string, unknown>) {
  const title = suggestText(body.title, 200) || "Untitled idea";
  return {
    title,
    caption: suggestText(body.caption),
    notes: suggestText(body.notes),
    asset_url: safeAssetUrls(body.asset_url),
    channel: parseSuggestChannels(body.channel ?? body.channels),
  };
}

function publicItem(item: ContentItem): ContentItem {
  const copy = { ...item };
  delete copy.share_token;
  return copy;
}

async function findContent(id: string) {
  const items = await listContent();
  return items.find((item) => item.id === id) ?? null;
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireStaff();
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("Expected JSON", 400);
  }

  const fields = suggestionFields(body);
  const item = await createContent({
    title: fields.title,
    channel: fields.channel,
    content_type: "Social",
    owner: user.full_name || user.email,
    owner_user_id: user.id,
    due_date: null,
    deadline_date: null,
    status: "idea",
    category: "",
    priority: "",
    website: "",
    caption: fields.caption,
    theme_id: null,
    planable_url: "",
    planable_post_id: "",
    planable_group_id: "",
    planable_page_ids: [],
    last_synced_at: null,
    sync_source: "hub",
    asset_url: fields.asset_url,
    notes: fields.notes,
  });

  return jsonOk({ item: publicItem(item) }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const { user, error } = await requireStaff();
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("Expected JSON", 400);
  }

  const id = suggestText(body.id, 80);
  if (!id) return jsonError("id required", 400);
  const existing = await findContent(id);
  if (!existing || !canReviseOwnIdea(existing, user.id)) {
    return jsonError("Not found", 404);
  }

  const fields = suggestionFields(body);
  const updated = await updateContent(id, fields);
  if (!updated) return jsonError("Not found", 404);
  return jsonOk({ item: publicItem(updated) });
}

export async function DELETE(request: NextRequest) {
  const { user, error } = await requireStaff();
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("Expected JSON", 400);
  }

  const id = suggestText(body.id, 80);
  if (!id) return jsonError("id required", 400);
  const existing = await findContent(id);
  if (!existing || !canReviseOwnIdea(existing, user.id)) {
    return jsonError("Not found", 404);
  }

  await deleteContent(id);
  return jsonOk({ ok: true });
}
