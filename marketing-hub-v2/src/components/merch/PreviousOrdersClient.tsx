"use client";

import { useMemo, useState } from "react";
import { FilterBar, matchesSearch } from "@/components/ui/FilterBar";
import {
  PREVIOUS_CLOTHING_ORDERS,
  type PreviousClothingRecord,
} from "@/lib/merch/previous-orders-seed";
import { formatMerchOrderClothing } from "@/lib/merch/order-items";
import type { MerchOrder } from "@/lib/types";
import { cn } from "@/lib/utils";

type PreviousRow = PreviousClothingRecord & {
  id: string;
  source: "seed" | "delivered";
  deliveredAt?: string;
};

function isEmptyRecord(clothing: string) {
  const lower = clothing.toLowerCase();
  return (
    lower.includes("no items recorded") ||
    lower.includes("awaiting confirmation")
  );
}

function deliveredRows(orders: MerchOrder[]): PreviousRow[] {
  return orders
    .filter((order) => order.status === "delivered")
    .map((order) => ({
      id: order.id,
      name: order.requested_for || order.created_by || "Unknown",
      clothing: formatMerchOrderClothing(order) || "No items recorded",
      source: "delivered" as const,
      deliveredAt: order.updated_at || order.created_at,
    }))
    .sort((a, b) => (b.deliveredAt ?? "").localeCompare(a.deliveredAt ?? ""));
}

function seedRows(): PreviousRow[] {
  return PREVIOUS_CLOTHING_ORDERS.map((row) => ({
    ...row,
    id: `seed:${row.name}`,
    source: "seed" as const,
  }));
}

export function PreviousOrdersClient({
  deliveredOrders = [],
}: {
  deliveredOrders?: MerchOrder[];
}) {
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<
    "all" | "delivered" | "original"
  >("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "recorded" | "empty">(
    "all"
  );

  const rows = useMemo(() => {
    return [...deliveredRows(deliveredOrders), ...seedRows()];
  }, [deliveredOrders]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (!matchesSearch(search, [row.name, row.clothing])) return false;
      if (sourceFilter === "delivered" && row.source !== "delivered") return false;
      if (sourceFilter === "original" && row.source !== "seed") return false;
      const empty = isEmptyRecord(row.clothing);
      if (statusFilter === "recorded" && empty) return false;
      if (statusFilter === "empty" && !empty) return false;
      return true;
    });
  }, [rows, search, sourceFilter, statusFilter]);

  return (
    <div>
      <p className="mb-4 text-sm text-muted">
        Issued kit archive — the original clothing issue plus orders that have
        been marked delivered. Active requests stay under Orders until then.
      </p>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search name or item…"
        resultCount={filtered.length}
        totalCount={rows.length}
        selects={[
          {
            id: "source",
            label: "Source",
            value: sourceFilter,
            onChange: (value) =>
              setSourceFilter(value as "all" | "delivered" | "original"),
            options: [
              { value: "all", label: "All" },
              { value: "delivered", label: "Delivered from Orders" },
              { value: "original", label: "Original issue" },
            ],
          },
          {
            id: "status",
            label: "Status",
            value: statusFilter,
            onChange: (value) =>
              setStatusFilter(value as "all" | "recorded" | "empty"),
            options: [
              { value: "all", label: "All" },
              { value: "recorded", label: "Items recorded" },
              { value: "empty", label: "None / awaiting" },
            ],
          },
        ]}
      />

      <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
        <div className="hidden grid-cols-[minmax(10rem,14rem)_1fr_auto] gap-3 border-b border-border bg-sand/40 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted sm:grid">
          <span>Name</span>
          <span>Clothing recorded</span>
          <span>Source</span>
        </div>
        <ul className="divide-y divide-border">
          {filtered.map((row) => (
            <PreviousOrderRow key={row.id} row={row} />
          ))}
        </ul>
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">
            No matching records.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function PreviousOrderRow({ row }: { row: PreviousRow }) {
  const empty = isEmptyRecord(row.clothing);
  return (
    <li className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(10rem,14rem)_1fr_auto] sm:items-start sm:gap-3">
      <div className="font-medium text-foreground">{row.name}</div>
      <div
        className={cn(
          "text-sm",
          empty ? "italic text-muted" : "text-foreground"
        )}
      >
        {row.clothing}
      </div>
      <div className="text-xs text-muted sm:text-right">
        {row.source === "delivered" ? "Delivered" : "Original issue"}
      </div>
    </li>
  );
}
