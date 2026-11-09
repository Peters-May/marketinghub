"use client";

import { useEffect, useState } from "react";
import { StaffRequestsClient } from "@/components/internal/StaffRequestsClient";
import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentFilter } from "@/components/ui/SegmentFilter";
import { onTourPrepare } from "@/lib/tour/bus";
import type { StaffRequest, StaffRequestKind } from "@/lib/types";

type Tab = "asset" | "social_form" | "other";

const TABS: { id: Tab; label: string }[] = [
  { id: "asset", label: "Asset request" },
  { id: "social_form", label: "Social form" },
  { id: "other", label: "Other" },
];

export function InternalHub({
  requests,
}: {
  requests: StaffRequest[];
}) {
  const [tab, setTab] = useState<Tab>("asset");

  useEffect(() => {
    return onTourPrepare((action) => {
      if (action.type === "requests-tab") {
        if (
          action.tab === "asset" ||
          action.tab === "social_form" ||
          action.tab === "other"
        ) {
          setTab(action.tab);
        } else {
          setTab("asset");
        }
      }
    });
  }, []);

  return (
    <div>
      <PageHeader
        title="Requests"
        description="Asset asks, social forms, and other staff requests for Marketing."
      />

      <SegmentFilter
        label="Request type"
        value={tab}
        onChange={setTab}
        options={TABS}
        size="lg"
        tourIdPrefix="requests-tab"
      />

      <StaffRequestsClient
        key={tab}
        initial={requests}
        kind={tab as StaffRequestKind}
        startWithForm
      />
    </div>
  );
}
