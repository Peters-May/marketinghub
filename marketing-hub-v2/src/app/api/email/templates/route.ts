import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireAdmin } from "@/lib/api";
import {
  createEmailTemplate,
  deleteEmailTemplate,
  listEmailTemplates,
  updateEmailTemplate,
} from "@/lib/data/repos";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  return jsonOk({ templates: await listEmailTemplates() });
}

export async function POST(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;
  const body = await request.json();
  const action = body.action as string | undefined;

  if (action === "update") {
    const item = await updateEmailTemplate(body.id, body.patch ?? {});
    if (!item) return jsonError("Not found", 404);
    return jsonOk({ item });
  }

  if (action === "delete") {
    await deleteEmailTemplate(body.id);
    return jsonOk({ ok: true });
  }

  const item = await createEmailTemplate({
    name: body.name ?? "Untitled template",
    subject_default: body.subject_default ?? "",
    preview_text_default: body.preview_text_default ?? "",
    html_body: body.html_body ?? "",
  });
  return jsonOk({ item }, { status: 201 });
}
