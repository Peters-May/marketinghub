"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useHubView } from "@/lib/hub-view";
import { navForView } from "@/lib/nav";

/** Account pages linked from the user menu (not sidebar nav). */
const ALWAYS_ALLOWED = ["/app/me"];

/** Redirect restricted views away from routes they should not see. */
export function MemberRouteGuard({ children }: { children: React.ReactNode }) {
  const { view, ready, canAccessBudget, budgetInMemberNav } = useHubView();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!ready || view === "admin") return;
    const allowed = Array.from(
      new Set([
        ...ALWAYS_ALLOWED,
        ...navForView(view, { canAccessBudget, budgetInMemberNav }).map(
          (n) => n.href
        ),
      ])
    );
    const ok = allowed.some((href) =>
      href === "/app"
        ? pathname === "/app"
        : pathname === href || pathname.startsWith(`${href}/`)
    );
    if (!ok) {
      router.replace(
        view === "external"
          ? "/app/library"
          : view === "seo"
            ? "/app/enquiries"
            : "/app"
      );
    }
  }, [ready, view, pathname, router, canAccessBudget, budgetInMemberNav]);

  return <>{children}</>;
}
