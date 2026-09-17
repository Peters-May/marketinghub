import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireStaff } from "@/lib/api";
import {
  createContact,
  ensureContactForUser,
  getContactByUserId,
  updateContact,
} from "@/lib/data/repos";
import type { Contact } from "@/lib/types";

/** Member (and admin) access to their own linked contact only. */
export async function GET() {
  const { user, error } = await requireStaff();
  if (error) return error;

  const contact = await ensureContactForUser({
    userId: user.id,
    email: user.email ?? "",
    full_name: user.full_name,
    createIfMissing: true,
  });

  return jsonOk({ contact });
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireStaff();
  if (error) return error;

  const body = await request.json();
  const action = body.action as string | undefined;

  let contact = await ensureContactForUser({
    userId: user.id,
    email: user.email ?? "",
    full_name: user.full_name,
    createIfMissing: false,
  });

  if (action === "create" || (!contact && action !== "update")) {
    if (contact) {
      return jsonError("You already have a linked contact", 400);
    }
    const tags = Array.isArray(body.tags)
      ? body.tags
      : String(body.tags ?? "")
          .split(",")
          .map((t: string) => t.trim())
          .filter(Boolean);
    const item = await createContact({
      name: String(body.name ?? user.full_name ?? "Contact").trim() || "Contact",
      kind: "person",
      organisation: body.organisation ?? "",
      role: body.role ?? "",
      email: body.email ?? user.email ?? "",
      phone: body.phone ?? "",
      website: "",
      services: "",
      tags,
      notes: body.notes ?? "",
      user_id: user.id,
      is_press: false,
      beat: "",
      outlet: "",
      country: "",
      preferred_topics: "",
      last_contacted_at: null,
    });
    return jsonOk({ contact: item }, { status: 201 });
  }

  if (!contact) {
    contact = await getContactByUserId(user.id);
  }

  if (!contact) {
    return jsonError("No linked contact. Ask an admin to link your account.", 404);
  }

  const tags =
    body.tags === undefined
      ? undefined
      : Array.isArray(body.tags)
        ? body.tags
        : String(body.tags ?? "")
            .split(",")
            .map((t: string) => t.trim())
            .filter(Boolean);

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = String(body.name).trim() || contact.name;
  if (body.organisation !== undefined) patch.organisation = body.organisation;
  if (body.role !== undefined) patch.role = body.role;
  if (body.email !== undefined) patch.email = body.email;
  if (body.phone !== undefined) patch.phone = body.phone;
  if (tags !== undefined) patch.tags = tags;
  if (body.notes !== undefined) patch.notes = body.notes;

  const updated = await updateContact(contact.id, patch as Partial<Contact>);
  if (!updated) return jsonError("Not found", 404);
  return jsonOk({ contact: updated });
}
