"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CopyEmailButton({
  kind,
  id,
  className = "btn-secondary px-2.5 py-1 text-xs",
  label = "Copy",
}: {
  kind: "campaign" | "template";
  id: string;
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function copy(event: React.MouseEvent) {
    event.stopPropagation();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        kind === "template" ? "/api/email/templates" : "/api/email/campaigns",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "clone", id }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not copy this email");
      router.push(`/app/email/design/${kind}/${data.item.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not copy this email");
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" className={className} disabled={busy} onClick={(event) => void copy(event)}>
        {busy ? "Copying…" : label}
      </button>
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </span>
  );
}
