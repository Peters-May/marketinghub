import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireAdmin } from "@/lib/api";
import {
  createEmailTemplate,
  deleteEmailTemplate,
  getEmailTemplate,
  listEmailTemplates,
  setEmailTemplateShare,
  updateEmailTemplate,
} from "@/lib/data/repos";
import { copyName } from "@/lib/email/clone";
import type { EmailTemplate } from "@/lib/types";
import { emailSharePath, omitEmailSharePatch } from "@/lib/email/share";

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
    const patch = omitEmailSharePatch(
      body.patch && typeof body.patch === "object" ? body.patch : {}
    );
    const item = await updateEmailTemplate(
      body.id,
      patch as Partial<EmailTemplate>
    );
    if (!item) return jsonError("Not found", 404);
    return jsonOk({ item });
  }

  if (action === "set_share") {
    const id = String(body.id ?? "");
    if (!id) return jsonError("id required", 400);
    const enabled = body.enabled === true;
    const patch = enabled
      ? (omitEmailSharePatch(
          body.patch && typeof body.patch === "object" ? body.patch : {}
        ) as Partial<EmailTemplate>)
      : undefined;
    const result = await setEmailTemplateShare(id, enabled, patch);
    if (!result) return jsonError("Not found", 404);
    return jsonOk({
      share_enabled: result.share_enabled,
      share_token: result.share_token,
      path: result.share_enabled ? emailSharePath(result.share_token) : "",
    });
  }

  if (action === "clone") {
    const existing = await getEmailTemplate(String(body.id ?? ""));
    if (!existing) return jsonError("Not found", 404);
    const item = await createEmailTemplate({
      name: copyName(existing.name),
      subject_default: existing.subject_default,
      preview_text_default: existing.preview_text_default,
      html_body: existing.html_body,
      design: existing.design,
    });
    return jsonOk({ item }, { status: 201 });
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
    design: body.design ?? null,
  });
  return jsonOk({ item }, { status: 201 });
}
