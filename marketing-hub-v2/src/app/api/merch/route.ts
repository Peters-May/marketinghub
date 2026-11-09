import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireStaff } from "@/lib/api";
import {
  createMerchOrder,
  deleteMerchOrder,
  getContact,
  getMerchOrder,
  listMerchOrders,
  updateMerchOrder,
} from "@/lib/data/repos";
import type { MerchOrder } from "@/lib/types";
import {
  filterMerchOrdersForUser,
  isMerchAdmin,
  ownsMerchOrder,
} from "@/lib/merch/access";
import { notifyMarketingAlert } from "@/lib/email/send-marketing-alert";
import { normalizeClothingLogo } from "@/lib/merch/north-sails";
import {
  normalizeMerchOrderItems,
  syncMerchOrderPrimaryFields,
} from "@/lib/merch/order-items";
import { resolveMerchRequestedFor } from "@/lib/merch/requested-for";

export async function GET() {
  const { user, error } = await requireStaff();
  if (error) return error;
  const orders = filterMerchOrdersForUser(await listMerchOrders(), user);
  return jsonOk({ orders, canManageAll: isMerchAdmin(user) });
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireStaff();
  if (error) return error;
  const body = await request.json();
  const action = body.action as string | undefined;
  const admin = isMerchAdmin(user);
  const fallbackName = user.full_name || user.email || "Staff";

  if (action === "update") {
    const existing = await getMerchOrder(body.id);
    if (!existing) return jsonError("Not found", 404);
    if (!admin && !ownsMerchOrder(existing, user)) {
      return jsonError("Forbidden", 403);
    }
    const patch = { ...(body.patch ?? {}) } as Record<string, unknown>;
    // Members cannot reassign ownership.
    delete patch.created_by_user_id;
    delete patch.for_mode;
    if (!admin) {
      delete patch.created_by;
      // Members may change the display name / clear contact, but not allocate to others.
      if (patch.requested_for_contact_id !== undefined) {
        const rawId =
          typeof patch.requested_for_contact_id === "string"
            ? patch.requested_for_contact_id.trim()
            : "";
        // Only allow keeping/clearing — not picking another person's contact.
        if (rawId && rawId !== (existing.requested_for_contact_id ?? "")) {
          const ownContactOk =
            (await getContact(rawId))?.user_id === user.id;
          if (!ownContactOk) {
            delete patch.requested_for_contact_id;
          }
        }
      }
      if (
        patch.status !== undefined &&
        patch.status !== existing.status &&
        patch.status !== "cancelled" &&
        patch.status !== "requested"
      ) {
        return jsonError("Only marketing admins can change order status", 403);
      }
    } else if (
      patch.requested_for_contact_id !== undefined ||
      patch.requested_for !== undefined
    ) {
      const contactId =
        patch.requested_for_contact_id === null ||
        patch.requested_for_contact_id === ""
          ? null
          : typeof patch.requested_for_contact_id === "string"
            ? patch.requested_for_contact_id
            : (existing.requested_for_contact_id ?? null);
      const contact = contactId ? await getContact(contactId) : null;
      const resolved = resolveMerchRequestedFor({
        requested_for:
          typeof patch.requested_for === "string"
            ? patch.requested_for
            : existing.requested_for,
        requested_for_contact_id: contactId,
        contact,
        fallbackName: existing.requested_for || fallbackName,
      });
      patch.requested_for = resolved.requested_for;
      patch.requested_for_contact_id = resolved.requested_for_contact_id;
      // Linked contact → allocate order to that hub member so it appears in their list.
      if (resolved.allocated_user_id) {
        patch.created_by_user_id = resolved.allocated_user_id;
      }
    }
    if (patch.items !== undefined) {
      const items = normalizeMerchOrderItems({
        ...existing,
        items: Array.isArray(patch.items)
          ? (patch.items as MerchOrder["items"])
          : undefined,
      });
      if (items.length === 0) {
        return jsonError("Add at least one item to the order", 400);
      }
      Object.assign(patch, syncMerchOrderPrimaryFields(items), { items });
    }
    const updated = await updateMerchOrder(body.id, patch);
    if (!updated) return jsonError("Not found", 404);
    return jsonOk({ item: updated });
  }

  if (action === "delete") {
    const existing = await getMerchOrder(body.id);
    if (!existing) return jsonError("Not found", 404);
    if (!admin && !ownsMerchOrder(existing, user)) {
      return jsonError("Forbidden", 403);
    }
    try {
      await deleteMerchOrder(body.id);
    } catch (err) {
      console.error("[merch] delete failed", err);
      return jsonError("Could not delete order", 500);
    }
    return jsonOk({ ok: true });
  }

  const contactId =
    typeof body.requested_for_contact_id === "string"
      ? body.requested_for_contact_id.trim()
      : "";
  let contact = contactId ? await getContact(contactId) : null;
  // Members may only link their own contact (Myself), not allocate to others.
  if (!admin && contact && contact.user_id !== user.id) {
    contact = null;
  }
  const resolved = resolveMerchRequestedFor({
    requested_for: body.requested_for,
    requested_for_contact_id: contact?.id ?? null,
    contact,
    fallbackName,
  });

  const items = normalizeMerchOrderItems({
    items: Array.isArray(body.items) ? body.items : undefined,
    item: typeof body.item === "string" ? body.item : "",
    fit: body.fit === "female" || body.fit === "male" ? body.fit : "",
    size: typeof body.size === "string" ? body.size : "",
    quantity: Number(body.quantity) > 0 ? Number(body.quantity) : 1,
    colour: typeof body.colour === "string" ? body.colour : "",
    logo: normalizeClothingLogo(body.logo),
  });
  if (items.length === 0) {
    return jsonError("Add at least one item to the order", 400);
  }

  const item = await createMerchOrder({
    ...syncMerchOrderPrimaryFields(items),
    items,
    requested_for: resolved.requested_for,
    requested_for_contact_id: resolved.requested_for_contact_id,
    office: body.office ?? "",
    needed_by: body.needed_by || null,
    status: admin ? body.status ?? "requested" : "requested",
    notes: body.notes ?? "",
    created_by: fallbackName,
    // Admin allocating to a linked contact → order appears under that member.
    // Otherwise ownership stays with the submitter.
    created_by_user_id:
      admin && resolved.allocated_user_id
        ? resolved.allocated_user_id
        : user.id,
  });
  notifyMarketingAlert({
    kind: "clothing",
    clothing: {
      requested_for: item.requested_for,
      created_by: item.created_by,
      office: item.office,
      needed_by: item.needed_by,
      notes: item.notes,
      lines: (item.items ?? items).map((line) => ({
        item: line.item,
        fit: line.fit,
        size: line.size,
        colour: line.colour,
        logo: line.logo,
        quantity: line.quantity,
        is_other: line.is_other,
        other_description: line.other_description,
      })),
    },
  });
  return jsonOk({ item }, { status: 201 });
}
