"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function SendingProgress({
  sent,
  total,
}: {
  sent: number;
  total: number;
}) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), 20000);
    return () => window.clearInterval(id);
  }, [router]);

  return (
    <p className="rounded-lg border border-border bg-slate-50 px-3 py-2 text-sm text-brand">
      Sending in the background. {sent.toLocaleString("en-GB")} of{" "}
      {total.toLocaleString("en-GB")} sent. You can leave this page.
    </p>
  );
}
