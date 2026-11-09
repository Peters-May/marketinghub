"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MerchClient } from "@/components/merch/MerchClient";
import { StaffRequestsClient } from "@/components/internal/StaffRequestsClient";
import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentFilter } from "@/components/ui/SegmentFilter";
import { onTourPrepare } from "@/lib/tour/bus";
import type {
  MerchInventoryItem,
  MerchOrder,
  StaffRequest,
  StaffRequestKind,
} from "@/lib/types";

type Tab = "merch" | "asset" | "social_form" | "other";

const TABS: { id: Tab; label: string }[] = [
  { id: "merch", label: "Corporate clothing" },
  { id: "asset", label: "Asset request" },
  { id: "social_form", label: "Social form" },
  { id: "other", label: "Other" },
];

export function InternalHub({
  merch,
  inventory: _inventory,
  requests,
  canManageAll = false,
  viewerName = "",
  viewerContactId = null,
}: {
  merch: MerchOrder[];
  inventory: MerchInventoryItem[];
  requests: StaffRequest[];
  canManageAll?: boolean;
  viewerName?: string;
  viewerContactId?: string | null;
}) {
  const [tab, setTab] = useState<Tab>("asset");

  useEffect(() => {
    return onTourPrepare((action) => {
      if (action.type === "requests-tab") {
        setTab(action.tab);
      }
    });
  }, []);

  return (
    <div>
      <PageHeader
        title="Requests"
        description={
          canManageAll
            ? "Asset asks and social form requests for Marketing. Clothing lives in the Shop."
            : "Request assets or social forms. Browse and order clothing in the Shop."
        }
      />

      <SegmentFilter
        label="Request type"
        value={tab}
        onChange={setTab}
        options={TABS}
        size="lg"
        tourIdPrefix="requests-tab"
      />

      {tab === "merch" ? (
        <div data-tour="requests-clothing" className="space-y-5">
          <div className="surface-card p-5">
            <h2 className="font-display text-xl text-brand">Clothing shop</h2>
            <p className="mt-1 text-sm text-muted">
              Browse products, choose colours and sizes, and submit clothing
              requests from the dedicated Shop page.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/shop" className="btn-primary">
                Open shop
              </Link>
              {canManageAll ? (
                <Link href="/shop" className="btn-secondary">
                  Manage catalogue
                </Link>
              ) : null}
            </div>
          </div>
          <MerchClient
            initial={merch}
            hideHeader
            ordersOnly
            canManageAll={canManageAll}
            viewerName={viewerName}
            viewerContactId={viewerContactId}
          />
        </div>
      ) : (
        <StaffRequestsClient
          key={tab}
          initial={requests}
          kind={tab as StaffRequestKind}
          startWithForm
        />
      )}
    </div>
  );
}
