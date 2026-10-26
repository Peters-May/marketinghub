"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Menu, Sparkles, X } from "lucide-react";
import { canAccessBudget as userCanAccessBudget } from "@/lib/auth/budget-access";
import { navForView } from "@/lib/nav";
import { HubViewProvider, useHubView } from "@/lib/hub-view";
import {
  ASSISTANT_DOCK_WIDTH,
  AiAssistantPanel,
  AiAssistantTrigger,
} from "@/components/ai/AiAssistantPanel";
import { MemberRouteGuard } from "@/components/shell/MemberRouteGuard";
import { AccountMenu, SignOutLink } from "@/components/shell/AccountMenu";
import { BrandLockup } from "@/components/shell/BrandLockup";
import { HubTourProvider } from "@/components/tour/HubTour";
import { cn } from "@/lib/utils";
import type { HubViewMode } from "@/lib/nav";
import type { UserRole } from "@/lib/types";

const ASSISTANT_DOCK_KEY = "hub-assistant-dock";

function navTourId(href: string): string {
  if (href === "/app") return "home";
  const slug = href.replace(/^\/app\/?/, "") || "home";
  return slug.split("/")[0] || "home";
}

function viewLabel(view: HubViewMode) {
  if (view === "seo") return "SEO";
  if (view === "admin") return "Admin";
  if (view === "member") return "Member";
  return "External";
}

function ViewToggle({ canToggle }: { canToggle: boolean }) {
  const { view, setView, ready } = useHubView();
  if (!ready) {
    return <div className="h-9 rounded-xl bg-sand/80" aria-hidden />;
  }

  if (!canToggle) {
    return (
      <p
        data-tour="view-toggle"
        className="rounded-xl border border-border bg-sand/60 px-3 py-2 text-xs font-medium text-brand"
      >
        {viewLabel(view)} view
      </p>
    );
  }

  return (
    <div
      data-tour="view-toggle"
      className="inline-flex w-full rounded-xl border border-border bg-sand/60 p-1"
      role="group"
      aria-label="Hub view"
    >
      {(
        [
          { id: "member", label: "Member" },
          { id: "admin", label: "Admin" },
          { id: "seo", label: "SEO" },
          { id: "external", label: "External" },
        ] as const
      ).map((option) => (
        <button
          key={option.id}
          type="button"
          className={cn(
            "flex-1 rounded-lg px-1 py-1.5 text-[11px] font-medium transition sm:px-1.5 sm:text-xs",
            view === option.id
              ? "bg-white text-brand shadow-sm"
              : "text-muted hover:text-foreground"
          )}
          onClick={() => setView(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ShellInner({
  children,
  userName,
  userEmail,
  accessRole,
  canToggleAdminView,
}: {
  children: React.ReactNode;
  userName: string;
  userEmail?: string;
  accessRole?: UserRole;
  canToggleAdminView: boolean;
}) {
  const pathname = usePathname();
  const mainRef = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(true);
  const { view, setView, canAccessBudget, budgetInMemberNav } = useHubView();
  const nav = navForView(view, { canAccessBudget, budgetInMemberNav });
  const canUseAssistant = accessRole === "admin" || accessRole === "staff";
  const assistantReadOnly = accessRole !== "admin";

  useEffect(() => {
    if (!canUseAssistant) return;
    const saved = window.localStorage.getItem(ASSISTANT_DOCK_KEY);
    if (saved === "0") setAssistantOpen(false);
    else if (saved === "1") setAssistantOpen(true);
    else if (!window.matchMedia("(min-width: 1024px)").matches) {
      setAssistantOpen(false);
    }
  }, [canUseAssistant]);

  const setAssistant = useCallback((next: boolean) => {
    setAssistantOpen(next);
    try {
      window.localStorage.setItem(ASSISTANT_DOCK_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  // FullCalendar sizes its columns in pixels and only listens for window
  // resizes. Opening or closing the assistant changes the main width without
  // one, so the calendar stays at the docked width until we notify it.
  useEffect(() => {
    const el = mainRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let width = el.getBoundingClientRect().width;
    let frame = 0;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? 0;
      if (Math.abs(next - width) < 1) return;
      width = next;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        window.dispatchEvent(new Event("resize"));
      });
    });
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const ensureAdminView = useCallback(() => {
    if (canToggleAdminView) setView("admin");
  }, [canToggleAdminView, setView]);

  const Nav = (
    <nav className="flex flex-col gap-1 p-3">
      {nav.map((item) => {
        const active =
          item.href === "/app"
            ? pathname === "/app"
            : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            // Each section loads the full hub document. Viewport prefetch
            // would run all of those reads at once and time the database out.
            prefetch={false}
            data-tour={`nav-${navTourId(item.href)}`}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
              active
                ? "bg-accent-soft text-brand font-medium"
                : "text-muted hover:bg-sand hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <HubTourProvider
      userKey={userEmail || userName}
      accessRole={accessRole}
      hubView={view}
      onEnsureAdminView={ensureAdminView}
      onOpenMobileNav={() => setOpen(true)}
    >
      <div
        className="min-h-screen md:flex"
        style={
          {
            "--assistant-dock":
              canUseAssistant && assistantOpen ? ASSISTANT_DOCK_WIDTH : "0px",
          } as CSSProperties
        }
      >
        <aside
          data-tour="sidebar"
          className="hidden w-64 shrink-0 border-r border-border bg-white/80 backdrop-blur md:flex md:flex-col"
        >
          <div className="border-b border-border px-5 py-5">
            <BrandLockup />
            <div className="mt-4 space-y-1.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted">
                View
              </p>
              <ViewToggle canToggle={canToggleAdminView} />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">{Nav}</div>
          <div className="border-t border-border px-3 py-3">
            {canUseAssistant ? (
              <AiAssistantTrigger
                open={assistantOpen}
                onToggle={() => setAssistant(!assistantOpen)}
                className="mb-1"
              />
            ) : null}
            <AccountMenu
              userName={userName}
              userEmail={userEmail}
              accessRole={accessRole}
            />
            <p className="mt-2 px-1 text-[11px] text-muted">
              {viewLabel(view)} view
            </p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-white/90 px-4 py-3 backdrop-blur md:hidden">
            <BrandLockup size={28} />
            <div className="flex shrink-0 items-center gap-2">
              {canUseAssistant ? (
                <button
                  type="button"
                  className="btn-secondary px-3 py-2"
                  onClick={() => setAssistant(!assistantOpen)}
                  aria-pressed={assistantOpen}
                  aria-label={
                    assistantOpen ? "Collapse assistant" : "Show assistant"
                  }
                >
                  <Sparkles className="h-4 w-4" />
                </button>
              ) : null}
              <AccountMenu
                userName={userName}
                userEmail={userEmail}
                accessRole={accessRole}
                compact
              />
              <button
                type="button"
                className="btn-secondary px-3 py-2"
                onClick={() => setOpen((v) => !v)}
                aria-label="Toggle menu"
              >
                {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </button>
            </div>
          </header>

          {open && (
            <div
              data-tour="sidebar"
              className="border-b border-border bg-white md:hidden"
            >
              <div className="px-3 pt-3">
                <ViewToggle canToggle={canToggleAdminView} />
              </div>
              {Nav}
              <div className="border-t border-border px-5 py-3">
                <p className="text-xs text-muted">Signed in as {userName}</p>
                <SignOutLink />
              </div>
            </div>
          )}

          <div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
            <main
              ref={mainRef}
              className="order-2 min-w-0 flex-1 px-4 py-6 md:order-1 md:px-8 md:py-8"
            >
              <MemberRouteGuard>{children}</MemberRouteGuard>
            </main>
            {canUseAssistant ? (
              <AiAssistantPanel
                open={assistantOpen}
                onClose={() => setAssistant(false)}
                onOpen={() => setAssistant(true)}
                readOnly={assistantReadOnly}
                className="order-1 md:order-2"
              />
            ) : null}
          </div>
        </div>
      </div>
    </HubTourProvider>
  );
}

export function AppShell({
  children,
  userName,
  userEmail,
  accessRole = "admin",
}: {
  children: React.ReactNode;
  userName: string;
  userEmail?: string;
  /** Session role from profiles — admins may toggle Admin/Member/SEO/External UI. */
  accessRole?: UserRole;
}) {
  const canToggleAdminView = accessRole === "admin";
  const canAccessBudget = userCanAccessBudget({
    role: accessRole,
    email: userEmail ?? "",
  });
  // Members must not see Budget. Admins only see it in Admin view.
  // Allowlisted non-admins (Simon / Tom / Michael) still get it in Member nav.
  const budgetInMemberNav = canAccessBudget && !canToggleAdminView;
  const initialView: HubViewMode =
    accessRole === "admin"
      ? "admin"
      : accessRole === "seo"
        ? "seo"
        : "member";

  return (
    <HubViewProvider
      initialView={initialView}
      canToggleAdminView={canToggleAdminView}
      canAccessBudget={canAccessBudget}
      budgetInMemberNav={budgetInMemberNav}
    >
      <ShellInner
        userName={userName}
        userEmail={userEmail}
        accessRole={accessRole}
        canToggleAdminView={canToggleAdminView}
      >
        {children}
      </ShellInner>
    </HubViewProvider>
  );
}
