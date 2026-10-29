"use client";

import { useEffect } from "react";

export default function AppSectionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] section failed to load", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="surface-card mx-auto max-w-lg p-6">
      <h1 className="font-display text-xl text-brand">This page did not load</h1>
      <p className="mt-2 text-sm text-muted">
        The hub could not read this section. Try again in a moment.
      </p>
      <button type="button" className="btn-primary mt-4" onClick={() => reset()}>
        Retry
      </button>
    </div>
  );
}
