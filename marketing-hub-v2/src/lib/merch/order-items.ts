import { DEFAULT_CLOTHING_LOGO, normalizeClothingLogo } from "@/lib/merch/north-sails";
import { plainTextFromHtml } from "@/lib/plain-text";
import type { MerchOrder, MerchOrderLineItem } from "@/lib/types";

/** Catalogue picker value for manual / non-catalogue clothing lines. */
export const OTHER_ITEM_LABEL = "Other (manual item)";

function normalizeLineItem(
  line: MerchOrderLineItem,
  index: number
): MerchOrderLineItem {
  const isOther =
    line.is_other === true ||
    line.item.trim() === OTHER_ITEM_LABEL ||
    line.item.trim().toLowerCase() === "other";
  const description = (line.other_description ?? "").trim();
  return {
    id: line.id || `line-${index}`,
    item: isOther ? OTHER_ITEM_LABEL : line.item.trim(),
    fit: isOther ? "" : line.fit === "female" || line.fit === "male" ? line.fit : "",
    size: isOther ? "" : line.size ?? "",
    quantity: Number(line.quantity) > 0 ? Number(line.quantity) : 1,
    colour: isOther ? "" : line.colour ?? "",
    logo: isOther ? "" : normalizeClothingLogo(line.logo),
    is_other: isOther,
    other_description: isOther ? description : "",
  };
}

/** Resolve line items from an order, including legacy single-item rows. */
export function getMerchOrderItems(order: MerchOrder): MerchOrderLineItem[] {
  if (order.items?.length) {
    return order.items.map(normalizeLineItem);
  }
  const isOther =
    order.item.trim() === OTHER_ITEM_LABEL ||
    order.item.trim().toLowerCase() === "other";
  return [
    normalizeLineItem(
      {
        id: "legacy",
        item: order.item,
        fit: order.fit,
        size: order.size,
        quantity: order.quantity,
        colour: order.colour,
        logo: order.logo,
        is_other: isOther,
        other_description: isOther ? order.item : "",
      },
      0
    ),
  ];
}

/** Keep top-level item fields in sync for search/filter and legacy views. */
export function syncMerchOrderPrimaryFields(
  items: MerchOrderLineItem[]
): Pick<MerchOrder, "item" | "fit" | "size" | "quantity" | "colour" | "logo"> {
  const first = items[0];
  if (!first) {
    return {
      item: "",
      fit: "",
      size: "",
      quantity: 1,
      colour: "",
      logo: DEFAULT_CLOTHING_LOGO,
    };
  }
  if (first.is_other) {
    const label = (first.other_description ?? "").trim() || OTHER_ITEM_LABEL;
    return {
      item: label,
      fit: "",
      size: "",
      quantity: first.quantity,
      colour: "",
      logo: "",
    };
  }
  return {
    item: first.item,
    fit: first.fit,
    size: first.size,
    quantity: first.quantity,
    colour: first.colour,
    logo: first.logo,
  };
}

export function normalizeMerchOrderItems(
  input: Partial<MerchOrder> & {
    items?: MerchOrderLineItem[];
  }
): MerchOrderLineItem[] {
  if (Array.isArray(input.items) && input.items.length > 0) {
    return input.items.map(normalizeLineItem).filter((line) => {
      if (line.is_other) return Boolean((line.other_description ?? "").trim());
      return Boolean(line.item.trim());
    });
  }
  const item = (input.item ?? "").trim();
  if (!item) return [];
  return getMerchOrderItems({
    ...(input as MerchOrder),
    items: [],
  });
}

export function merchOrderItemLabels(order: MerchOrder): string[] {
  return getMerchOrderItems(order).map((line) => {
    if (line.is_other) {
      return (line.other_description ?? "").trim() || OTHER_ITEM_LABEL;
    }
    return line.item;
  });
}

/** Compact clothing summary for previous-orders / issued-kit views. */
export function formatMerchOrderClothing(order: MerchOrder): string {
  return getMerchOrderItems(order)
    .map((line) => {
      if (line.is_other) {
        return (line.other_description ?? "").trim() || OTHER_ITEM_LABEL;
      }
      const parts: string[] = [line.item];
      const sizeColour = [line.size, line.colour].filter(Boolean).join(" ");
      if (line.quantity > 1 && sizeColour) {
        parts.push(`– ${line.quantity} × ${sizeColour}`);
      } else if (line.quantity > 1) {
        parts.push(`– ${line.quantity} ×`);
      } else if (sizeColour) {
        parts.push(`– ${sizeColour}`);
      }
      return parts.join(" ");
    })
    .filter(Boolean)
    .join("; ");
}

export function merchOrderSearchText(order: MerchOrder): string[] {
  const lines = getMerchOrderItems(order);
  return [
    order.requested_for,
    order.office,
    order.created_by,
    order.status,
    plainTextFromHtml(order.notes),
    ...lines.flatMap((line) => [
      line.item,
      line.other_description ?? "",
      line.fit,
      line.size,
      line.colour,
      line.logo,
      String(line.quantity),
    ]),
  ];
}
