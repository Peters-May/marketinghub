"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";

type ShareState = {
  share_enabled: boolean;
  share_token: string;
};

function shareUrl(token: string): string {
  return `${window.location.origin}/share/post/${encodeURIComponent(token)}`;
}

export function PostShareControls({
  contentId,
  enabled,
  shareToken,
  onUpdated,
}: {
  contentId: string;
  enabled: boolean;
  shareToken?: string;
  onUpdated: (next: ShareState) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [link, setLink] = useState("");

  async function copyText(url: string) {
    setLink(url);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  async function createOrCopy() {
    if (busy) return;
    setError(null);
    if (enabled && shareToken) {
      await copyText(shareUrl(shareToken));
      return;
    }
    setBusy(true);
    setCopied(false);
    try {
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_post_share",
          id: contentId,
          enabled: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not create the link");
        return;
      }
      const token = String(data.share_token ?? "");
      onUpdated({ share_enabled: true, share_token: token });
      if (data.path) {
        await copyText(`${window.location.origin}${data.path}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the link");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
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
          enabled: false,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not turn off the link");
        return;
      }
      onUpdated({
        share_enabled: false,
        share_token: String(data.share_token ?? shareToken ?? ""),
      });
      setLink("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not turn off the link");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="btn-secondary"
        disabled={busy}
        onClick={() => void createOrCopy()}
      >
        <Link2 className="h-4 w-4" />
        {busy ? "Creating…" : copied ? "Link copied" : enabled ? "Copy link" : "Create link"}
      </button>
      {enabled ? (
        <button
          type="button"
          className="btn-ghost"
          disabled={busy}
          onClick={() => void turnOff()}
        >
          Turn off
        </button>
      ) : null}
      {link ? <p className="w-full break-all text-xs text-slate-600">{link}</p> : null}
      {error ? <p className="w-full text-xs text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
