"use client";

import { useEffect } from "react";
import type { HubDataArea } from "@/lib/command/parse";

export type { HubDataArea };

export const HUB_DATA_CHANGED = "hub-data-changed";

export function notifyHubDataChanged(area: HubDataArea) {
  window.dispatchEvent(
    new CustomEvent(HUB_DATA_CHANGED, { detail: { area } })
  );
}

/** Refetch a page list after the command bar writes a record. */
export function useHubDataRefresh(area: HubDataArea, refresh: () => void) {
  useEffect(() => {
    const onChange = (event: Event) => {
      const next = (event as CustomEvent<{ area?: HubDataArea }>).detail?.area;
      if (next === area) refresh();
    };
    window.addEventListener(HUB_DATA_CHANGED, onChange);
    return () => window.removeEventListener(HUB_DATA_CHANGED, onChange);
  }, [area, refresh]);
}
