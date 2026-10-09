"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";

type ShareState = {
  share_enabled: boolean;
  share_token: string;
};

export function PostShareControls({
  contentId,
  enabled,
  onUpdated,
}: {
  contentId: string;
  enabled: boolean;
  onUpdated: (next: ShareState) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [link, setLink] = useState("");

  async function copyText(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this staff link:", url);
    }
  }

  async function setShare(nextEnabled: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_post_share",
          id: contentId,
          enabled: nextEnabled,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not update the staff link");
        return;
      }
      const share_token = String(data.share_token ?? "");
      const share_enabled = data.share_enabled === true;
      onUpdated({ share_enabled, share_token });
      if (share_enabled && data.path) {
        const url = `${window.location.origin}${data.path}`;
        setLink(url);
        await copyText(url);
      } else {
        setLink("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the staff link");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-slate-50 px-3 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
        Staff link
      </p>
      <p className="mt-1 text-xs text-muted">
        Anyone with the link can see this draft as it will look on social media,
        without signing in to the Hub. Save caption or image changes first.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {enabled ? (
          <>
            <button
              type="button"
              className="btn-secondary"
              disabled={busy}
              onClick={() => void setShare(true)}
            >
              <Link2 className="h-4 w-4" />
              {busy ? "Updating…" : copied ? "Link copied" : "Copy staff link"}
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={busy}
              onClick={() => void setShare(false)}
            >
              Turn off link
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => void setShare(true)}
          >
            <Link2 className="h-4 w-4" />
            {busy ? "Creating…" : "Create staff link"}
          </button>
        )}
      </div>
      {link ? (
        <p className="mt-2 break-all text-xs text-slate-600">{link}</p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
