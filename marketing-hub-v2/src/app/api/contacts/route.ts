import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireAdmin, requireStaff } from "@/lib/api";
import {
  createContact,
  deleteContact,
  listContacts,
  updateContact,
} from "@/lib/data/repos";
import type { Contact } from "@/lib/types";

export async function GET() {
  const { error } = await requireStaff();
  if (error) return error;
  return jsonOk({ contacts: await listContacts() });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const action = body.action as string | undefined;

  // Delete is admin-only; create/update allowed for members (staff) and admins.
  if (action === "delete") {
    const { error } = await requireAdmin();
    if (error) return error;
    await deleteContact(body.id);
    return jsonOk({ ok: true });
  }

  const { error } = await requireStaff();
  if (error) return error;

  if (action === "update") {
    const patch = { ...(body.patch ?? {}) } as Record<string, unknown>;
    if (patch.kind !== undefined) {
      patch.kind = patch.kind === "company" ? "company" : "person";
      if (patch.kind === "company") patch.user_id = null;
    }
    const updated = await updateContact(body.id, patch as Partial<Contact>);
    if (!updated) return jsonError("Not found", 404);
    return jsonOk({ item: updated });
  }

  const tags = Array.isArray(body.tags)
    ? body.tags
    : String(body.tags ?? "")
        .split(",")
        .map((t: string) => t.trim())
        .filter(Boolean);

  const kind = body.kind === "company" ? "company" : "person";

  const item = await createContact({
    name: body.name ?? (kind === "company" ? "Company" : "Contact"),
    kind,
    organisation:
      body.organisation ?? (kind === "company" ? body.name ?? "" : ""),
    role: body.role ?? "",
    email: body.email ?? "",
    phone: body.phone ?? "",
    website: body.website ?? "",
    services: body.services ?? "",
    tags,
    notes: body.notes ?? "",
    user_id: kind === "company" ? null : body.user_id ?? null,
    is_press: Boolean(body.is_press),
    beat: body.beat ?? "",
    outlet: body.outlet ?? "",
    country: body.country ?? "",
    preferred_topics: body.preferred_topics ?? "",
    last_contacted_at: body.last_contacted_at ?? null,
    marketing_consent:
      body.marketing_consent === true
        ? true
        : body.marketing_consent === false
          ? false
          : null,
  });
  return jsonOk({ item }, { status: 201 });
}
