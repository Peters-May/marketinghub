"use client";

import Link from "next/link";
import { useState } from "react";
import { signOutOfHub } from "@/lib/auth/sign-out";

const linkClass =
  "rounded-sm px-1 py-1 text-sm text-[#4D5C6A] transition-colors hover:text-[#0B2545] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007DC5] disabled:opacity-60";

export function NewsroomAuthLink({
  signedIn,
  returnTo,
}: {
  signedIn: boolean;
  returnTo: string;
}) {
  const [busy, setBusy] = useState(false);
  const next = returnTo.startsWith("/") ? returnTo : "/newsroom";

  if (!signedIn) {
    return (
      <Link
        href={`/login?intent=media&next=${encodeURIComponent(next)}`}
        className={linkClass}
      >
        Sign in
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={linkClass}
      disabled={busy}
      onClick={() => {
        if (busy) return;
        setBusy(true);
        void signOutOfHub()
          .then(() => {
            window.location.assign(next);
          })
          .catch(() => {
            setBusy(false);
          });
      }}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
