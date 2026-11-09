"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MerchClient } from "@/components/merch/MerchClient";
import { InventoryClient } from "@/components/merch/InventoryClient";
import { ClothingShopClient } from "@/components/merch/ClothingShopClient";
import { CatalogueManager } from "@/components/merch/CatalogueManager";
import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentFilter } from "@/components/ui/SegmentFilter";
import type { MerchInventoryItem, MerchOrder } from "@/lib/types";

type ShopView = "shop" | "orders" | "catalogue" | "inventory";

export function ShopHub({
  merch,
  inventory,
  canManageAll = false,
  viewerName = "",
  viewerContactId = null,
}: {
  merch: MerchOrder[];
  inventory: MerchInventoryItem[];
  canManageAll?: boolean;
  viewerName?: string;
  viewerContactId?: string | null;
}) {
  const [view, setView] = useState<ShopView>("shop");
  const [orders, setOrders] = useState(merch);

  useEffect(() => {
    setOrders(merch);
  }, [merch]);

  const views: { id: ShopView; label: string }[] = canManageAll
    ? [
        { id: "shop", label: "Shop" },
        { id: "orders", label: "Orders" },
        { id: "catalogue", label: "Catalogue" },
        { id: "inventory", label: "Stock" },
      ]
    : [
        { id: "shop", label: "Shop" },
        { id: "orders", label: "My orders" },
      ];

  return (
    <div data-tour="shop-page">
      <PageHeader
        title="Shop"
        description={
          canManageAll
            ? "Corporate clothing catalogue — browse, request kit, manage products and stock."
            : "Browse corporate clothing and submit requests to Marketing."
        }
      />

      <SegmentFilter
        label="Shop section"
        value={view}
        onChange={setView}
        options={views}
        size="md"
        tourIdPrefix="shop-view"
      />

      {view === "shop" ? (
        <ClothingShopClient
          canManageAll={canManageAll}
          viewerName={viewerName}
          viewerContactId={viewerContactId}
          onOrderCreated={(order) => {
            setOrders((prev) => [
              order,
              ...prev.filter((o) => o.id !== order.id),
            ]);
          }}
        />
      ) : view === "catalogue" && canManageAll ? (
        <CatalogueManager />
      ) : view === "inventory" && canManageAll ? (
        <InventoryClient initial={inventory} />
      ) : (
        <div>
          <p className="mb-4 text-sm text-muted">
            Need something new?{" "}
            <button
              type="button"
              className="text-brand underline-offset-2 hover:underline"
              onClick={() => setView("shop")}
            >
              Open the shop
            </button>
            {" · "}
            <Link
              href="/app/requests"
              className="text-brand underline-offset-2 hover:underline"
            >
              Other requests
            </Link>
          </p>
          <MerchClient
            initial={orders}
            hideHeader
            ordersOnly
            canManageAll={canManageAll}
            viewerName={viewerName}
            viewerContactId={viewerContactId}
          />
        </div>
      )}
    </div>
  );
}
