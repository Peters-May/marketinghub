import type { ContentItem, ContentStatus } from "@/lib/types";

export type ContentGroupBy = "none" | "theme" | "type" | "status" | "owner";

export type ContentGroup = {
  key: string;
  label: string;
  items: ContentItem[];
};

const STATUS_ORDER: ContentStatus[] = [
  "idea",
  "draft",
  "review",
  "approved",
  "scheduled",
  "published",
  "cancelled",
];

export function groupContentItems(
  items: ContentItem[],
  groupBy: ContentGroupBy,
  themeTitle: (themeId: string | null) => string
): ContentGroup[] {
  if (groupBy === "none") {
    return [{ key: "all", label: "", items }];
  }

  const groups = new Map<string, ContentGroup>();
  const labelFor = (item: ContentItem) => {
    if (groupBy === "theme") return themeTitle(item.theme_id);
    if (groupBy === "type") return item.content_type.trim() || "No type";
    if (groupBy === "owner") return item.owner.trim() || "No owner";
    return item.status;
  };
  const keyFor = (item: ContentItem) => {
    if (groupBy === "theme") return item.theme_id || "none";
    if (groupBy === "type") return item.content_type.trim() || "none";
    if (groupBy === "owner") return item.owner.trim().toLowerCase() || "none";
    return item.status;
  };

  for (const item of items) {
    const key = keyFor(item);
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.set(key, { key, label: labelFor(item), items: [item] });
    }
  }

  const list = Array.from(groups.values());
  if (groupBy === "status") {
    list.sort(
      (a, b) =>
        STATUS_ORDER.indexOf(a.key as ContentStatus) -
        STATUS_ORDER.indexOf(b.key as ContentStatus)
    );
  } else {
    list.sort((a, b) => a.label.localeCompare(b.label));
  }
  return list;
}
