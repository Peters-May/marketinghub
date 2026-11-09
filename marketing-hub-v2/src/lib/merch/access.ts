import type { SessionUser } from "@/lib/auth/session";
import type { MerchOrder } from "@/lib/types";

export function isMerchAdmin(user: SessionUser) {
  return user.role === "admin";
}

export type MerchOrderOwnershipOptions = {
  /** Linked contact for the signed-in user — matches public-shop email links. */
  contactId?: string | null;
};

/** True when notes record a public-shop guest email for this user. */
function notesIncludeUserEmail(order: MerchOrder, email: string) {
  const needle = email.trim().toLowerCase();
  if (!needle) return false;
  const notes = (order.notes || "").toLowerCase();
  return (
    notes.includes(`public shop request · ${needle}`) ||
    notes.includes(`public shop request ·${needle}`)
  );
}

/** True when this order belongs to the signed-in user. */
export function ownsMerchOrder(
  order: MerchOrder,
  user: SessionUser,
  options?: MerchOrderOwnershipOptions
) {
  if (order.created_by_user_id) {
    return order.created_by_user_id === user.id;
  }
  if (
    options?.contactId &&
    order.requested_for_contact_id &&
    order.requested_for_contact_id === options.contactId
  ) {
    return true;
  }
  if (notesIncludeUserEmail(order, user.email)) {
    return true;
  }
  // Legacy rows (pre user-id): match creator name/email.
  // Seed used short names like "Sophie" while profiles are "Sophie Edgerley".
  const needles = [user.full_name, user.email]
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const created = order.created_by.trim().toLowerCase();
  if (!created) return false;
  return needles.some((n) => {
    if (created === n) return true;
    const first = n.split(/\s+/)[0];
    return Boolean(first && created === first);
  });
}

export function filterMerchOrdersForUser(
  orders: MerchOrder[],
  user: SessionUser,
  options?: MerchOrderOwnershipOptions
): MerchOrder[] {
  if (isMerchAdmin(user)) return orders;
  return orders.filter((o) => ownsMerchOrder(o, user, options));
}
