import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/api";
import { createMerchOrder, getContactByEmail } from "@/lib/data/repos";
import { notifyMarketingAlert } from "@/lib/email/send-marketing-alert";
import { normalizeClothingLogo } from "@/lib/merch/north-sails";
import {
  normalizeMerchOrderItems,
  syncMerchOrderPrimaryFields,
} from "@/lib/merch/order-items";
import { resolveMerchRequestedFor } from "@/lib/merch/requested-for";

function plainNotes(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

/** Guest clothing request from the public shop — no login required. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return jsonError("Invalid request", 400);
  }

  const name =
    typeof body.name === "string" ? body.name.trim() : "";
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const office =
    typeof body.office === "string" ? body.office.trim() : "";
  if (!name) return jsonError("Name is required", 400);
  if (!email || !email.includes("@")) {
    return jsonError("A valid email is required", 400);
  }

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

  // Match hub contacts (and linked members) by guest email when possible.
  // Never block the order if contact lookup is slow or the store is locked.
  let contact = null;
  try {
    contact = await getContactByEmail(email);
  } catch (err) {
    console.error("[public/shop/orders] contact lookup failed:", err);
  }
  const resolved = resolveMerchRequestedFor({
    requested_for: name,
    contact,
    fallbackName: name,
  });

  const guestNotes = plainNotes(body.notes);
  const notesParts = [`Public shop request · ${email}`];
  if (guestNotes) notesParts.push(guestNotes);

  let item;
  try {
    item = await createMerchOrder({
      ...syncMerchOrderPrimaryFields(items),
      items,
      requested_for: resolved.requested_for,
      requested_for_contact_id: resolved.requested_for_contact_id,
      office: office || "—",
      needed_by:
        typeof body.needed_by === "string" && body.needed_by.trim()
          ? body.needed_by.trim()
          : null,
      status: "requested",
      notes: notesParts.join("\n\n"),
      created_by: name,
      created_by_user_id: resolved.allocated_user_id,
    });
  } catch (err) {
    console.error("[public/shop/orders] create failed:", err);
    return jsonError(
      "Could not save clothing request. Please try again in a moment.",
      503
    );
  }

  notifyMarketingAlert({
    kind: "clothing",
    clothing: {
      requested_for: item.requested_for,
      created_by: `${item.created_by} (${email})`,
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

  return jsonOk({ item, ok: true }, { status: 201 });
}
