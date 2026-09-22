"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, Sparkles, UserCircle } from "lucide-react";
import { signOutOfHub } from "@/lib/auth/sign-out";
import { useHubTour } from "@/components/tour/HubTour";
import { clearTourCompleted, sessionRoleToTourAudience } from "@/lib/tour/storage";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types";
import Link from "next/link";

function getInitials(name: string, email?: string): string {
  const trimmed = name.trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return trimmed.slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return "?";
}

function roleLabel(role?: UserRole): string | null {
  if (role === "admin") return "Admin";
  if (role === "staff") return "Member";
  if (role === "seo") return "SEO";
  if (role === "media_guest") return "Guest";
  return null;
}

export function AccountMenu({
  userName,
  userEmail,
  accessRole,
  compact = false,
  className,
}: {
  userName: string;
  userEmail?: string;
  accessRole?: UserRole;
  /** Icon-only trigger for tight headers (e.g. mobile). */
  compact?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const tour = useHubTour();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const initials = getInitials(userName, userEmail);
  const label = roleLabel(accessRole);

  function replayTour() {
    const audience =
      tour?.audience ?? sessionRoleToTourAudience(accessRole);
    clearTourCompleted(audience, userEmail || userName);
    setOpen(false);
    tour?.startTour();
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function onSignOut() {
    if (busy) return;
    setBusy(true);
    try {
      await signOutOfHub();
      setOpen(false);
      router.push("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      ref={rootRef}
      data-tour="account-menu"
      className={cn("relative", className)}
    >
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-2 rounded-xl border border-border bg-white/90 text-left transition hover:bg-sand/60",
          compact ? "p-1.5" : "w-full px-2.5 py-2"
        )}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        aria-label="Account menu"
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white",
            compact ? "h-8 w-8" : "h-8 w-8"
          )}
        >
          {initials}
        </span>
        {!compact ? (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">
                {userName}
              </span>
              {label ? (
                <span className="block truncate text-[11px] text-muted">
                  {label}
                </span>
              ) : null}
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-muted transition",
                open && "rotate-180"
              )}
            />
          </>
        ) : null}
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className={cn(
            "absolute z-50 mt-1.5 min-w-[12rem] overflow-hidden rounded-xl border border-border bg-white py-1 shadow-lg",
            compact ? "right-0" : "left-0 right-0"
          )}
        >
          {userEmail ? (
            <div className="truncate px-3 py-2 text-xs text-muted">
              {userEmail}
            </div>
          ) : (
            <div className="truncate px-3 py-2 text-xs text-muted">
              Signed in as {userName}
            </div>
          )}
          <div className="my-1 border-t border-border" />
          <Link
            href="/app/me"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-sand/80"
            onClick={() => setOpen(false)}
          >
            <UserCircle className="h-3.5 w-3.5" />
            My details
          </Link>
          {tour ? (
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-sand/80"
              onClick={replayTour}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Take a tour
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--danger)] hover:bg-sand/80 disabled:opacity-60"
            onClick={() => void onSignOut()}
          >
            <LogOut className="h-3.5 w-3.5" />
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Compact text sign-out for secondary placements (e.g. mobile drawer). */
export function SignOutLink({ className }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onSignOut() {
    if (busy) return;
    setBusy(true);
    try {
      await signOutOfHub();
      router.push("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void onSignOut()}
      disabled={busy}
      className={cn(
        "mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-brand hover:underline disabled:opacity-60",
        className
      )}
    >
      <LogOut className="h-3 w-3" />
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
