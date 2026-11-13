"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MerchOrder } from "@/lib/types";
import {
  ClothingShopGrid,
  type ShopSelection,
} from "@/components/merch/ClothingShopGrid";
import { ClothingProductDetail } from "@/components/merch/ClothingProductDetail";
import type { BagLineDraft } from "@/components/merch/ClothingProductDetail";
import { ClothingBag } from "@/components/merch/ClothingBag";
import type { ClothingProductCardItem } from "@/components/merch/ClothingProductCards";
import { FormAlert } from "@/components/ui/FormAlert";

export function ClothingShopClient({
  canManageAll = false,
  viewerName = "",
  viewerContactId = null,
  onOrderCreated,
  publicMode = false,
  hideIntro = false,
}: {
  canManageAll?: boolean;
  viewerName?: string;
  viewerContactId?: string | null;
  onOrderCreated?: (order: MerchOrder) => void;
  /** Public standalone shop — public APIs + guest checkout. */
  publicMode?: boolean;
  hideIntro?: boolean;
}) {
  const [products, setProducts] = useState<ClothingProductCardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selection, setSelection] = useState<ShopSelection | null>(null);
  const [bag, setBag] = useState<BagLineDraft[]>([]);
  const [bagOpen, setBagOpen] = useState(false);
  const [toast, setToast] = useState("");

  const catalogueUrl = publicMode
    ? "/api/public/shop/catalogue"
    : "/api/merch/catalogue";

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(catalogueUrl);
      if (!res.ok) {
        setLoadError("Could not load catalogue");
        return;
      }
      const data = (await res.json()) as {
        products?: ClothingProductCardItem[];
      };
      setProducts(
        (data.products ?? []).filter((product) => !product.hidden)
      );
    } catch {
      setLoadError("Could not load catalogue");
    } finally {
      setLoading(false);
    }
  }, [catalogueUrl]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const activeProduct = useMemo(
    () => products.find((p) => p.id === selection?.productId) ?? null,
    [products, selection]
  );

  const bagCount = bag.reduce((sum, line) => sum + line.quantity, 0);

  return (
    <div>
      {!hideIntro ? (
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl text-brand">Shop</h2>
            <p className="mt-0.5 text-sm text-muted">
              Browse corporate clothing, choose colour and size, then submit a
              request to Marketing.
            </p>
          </div>
          <button
            type="button"
            className="btn-primary"
            data-tour="requests-clothing-bag"
            onClick={() => setBagOpen(true)}
          >
            Bag{bagCount ? ` (${bagCount})` : ""}
          </button>
        </div>
      ) : (
        <div className="mb-6 flex justify-end">
          <button
            type="button"
            className="bg-[#0B2545] px-4 py-2.5 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-[#071A2E]"
            onClick={() => setBagOpen(true)}
          >
            Bag{bagCount ? ` (${bagCount})` : ""}
          </button>
        </div>
      )}

      {toast ? (
        <p className="mb-4 text-sm text-emerald-800" role="status">
          {toast}
        </p>
      ) : null}
      <div className="mb-4">
        <FormAlert message={loadError || null} />
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading catalogue…</p>
      ) : (
        <ClothingShopGrid
          products={products}
          onOpenProduct={setSelection}
        />
      )}

      {activeProduct && selection ? (
        <ClothingProductDetail
          product={activeProduct}
          initial={selection}
          standalone={publicMode}
          onClose={() => setSelection(null)}
          onAddToBag={(line) => {
            setBag((prev) => [...prev, line]);
            setSelection(null);
            setToast(`Added ${line.item} to bag`);
            window.setTimeout(() => setToast(""), 2500);
          }}
        />
      ) : null}

      {bagOpen ? (
        <ClothingBag
          lines={bag}
          onChangeLines={setBag}
          onClose={() => setBagOpen(false)}
          canManageAll={canManageAll}
          viewerName={viewerName}
          viewerContactId={viewerContactId}
          publicMode={publicMode}
          standalone={publicMode}
          onSubmitted={(order) => {
            setBag([]);
            setBagOpen(false);
            setToast("Request submitted to Marketing");
            window.setTimeout(() => setToast(""), 3000);
            onOrderCreated?.(order);
          }}
        />
      ) : null}
    </div>
  );
}
