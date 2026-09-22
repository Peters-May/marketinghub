import { Suspense } from "react";
import { UnsubscribeClient } from "@/components/email/UnsubscribeClient";

export const dynamic = "force-dynamic";

export default function UnsubscribePage() {
  return (
    <main className="min-h-screen bg-[var(--background)]">
      <Suspense fallback={<div className="p-8 text-sm text-muted">Loading…</div>}>
        <UnsubscribeClient />
      </Suspense>
    </main>
  );
}
