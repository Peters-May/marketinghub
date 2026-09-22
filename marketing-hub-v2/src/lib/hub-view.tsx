"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { HubViewMode } from "@/lib/nav";

export type { HubViewMode };

const STORAGE_KEY = "mh_hub_view";

type HubViewContextValue = {
  view: HubViewMode;
  setView: (view: HubViewMode) => void;
  ready: boolean;
  canToggleAdminView: boolean;
  canAccessBudget: boolean;
  /** Allowlisted non-admins only — Budget must not appear for Member preview. */
  budgetInMemberNav: boolean;
};

const HubViewContext = createContext<HubViewContextValue | null>(null);

export function HubViewProvider({
  children,
  initialView = "member",
  canToggleAdminView = false,
  canAccessBudget = false,
  budgetInMemberNav = false,
}: {
  children: React.ReactNode;
  initialView?: HubViewMode;
  canToggleAdminView?: boolean;
  canAccessBudget?: boolean;
  budgetInMemberNav?: boolean;
}) {
  const [view, setViewState] = useState<HubViewMode>(initialView);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!canToggleAdminView) {
      setViewState(initialView);
      setReady(true);
      return;
    }
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (
        saved === "admin" ||
        saved === "member" ||
        saved === "external" ||
        saved === "seo"
      ) {
        setViewState(saved);
      } else {
        setViewState(initialView);
      }
    } catch {
      setViewState(initialView);
    }
    setReady(true);
  }, [canToggleAdminView, initialView]);

  const setView = useCallback(
    (next: HubViewMode) => {
      if (!canToggleAdminView) return;
      setViewState(next);
      if (!canToggleAdminView) return;
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // ignore
      }
    },
    [canToggleAdminView]
  );

  const value = useMemo(
    () => ({
      view,
      setView,
      ready,
      canToggleAdminView,
      canAccessBudget,
      budgetInMemberNav,
    }),
    [
      view,
      setView,
      ready,
      canToggleAdminView,
      canAccessBudget,
      budgetInMemberNav,
    ]
  );

  return (
    <HubViewContext.Provider value={value}>{children}</HubViewContext.Provider>
  );
}

export function useHubView() {
  const ctx = useContext(HubViewContext);
  if (!ctx) {
    throw new Error("useHubView must be used within HubViewProvider");
  }
  return ctx;
}
