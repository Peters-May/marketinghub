"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { Menu, X } from "lucide-react";
import { canAccessBudget as userCanAccessBudget } from "@/lib/auth/budget-access";
import { navForView } from "@/lib/nav";
import { HubViewProvider, useHubView } from "@/lib/hub-view";
import { MemberRouteGuard } from "@/components/shell/MemberRouteGuard";
import { AccountMenu, SignOutLink } from "@/components/shell/AccountMenu";
import { BrandLockup } from "@/components/shell/BrandLockup";
import { HubTourProvider } from "@/components/tour/HubTour";
import { cn } from "@/lib/utils";
import type { HubViewMode } from "@/lib/nav";
import type { UserRole } from "@/lib/types";

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
  const [open, setOpen] = useState(false);
  const { view, setView, canAccessBudget, budgetInMemberNav } = useHubView();
  const nav = navForView(view, { canAccessBudget, budgetInMemberNav });

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
      <div className="min-h-screen md:flex">
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
            <div className="flex items-center gap-2">
              <div className="w-56">
                <ViewToggle canToggle={canToggleAdminView} />
              </div>
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
              {Nav}
              <div className="border-t border-border px-5 py-3">
                <p className="text-xs text-muted">Signed in as {userName}</p>
                <SignOutLink />
              </div>
            </div>
          )}

          <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
            <MemberRouteGuard>{children}</MemberRouteGuard>
          </main>
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
