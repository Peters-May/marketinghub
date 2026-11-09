"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";
import type { ShareAudience } from "@/lib/types";

type ShareState = {
  share_enabled: boolean;
  share_token: string;
  client_share_enabled: boolean;
  client_share_token: string;
};

function shareUrl(token: string): string {
  return `${window.location.origin}/share/post/${encodeURIComponent(token)}`;
}

export function PostShareControls({
  contentId,
  enabled,
  shareToken,
  clientEnabled = false,
  clientShareToken = "",
  onUpdated,
}: {
  contentId: string;
  enabled: boolean;
  shareToken?: string;
  clientEnabled?: boolean;
  clientShareToken?: string;
  onUpdated: (next: ShareState) => void;
}) {
  const [busy, setBusy] = useState<ShareAudience | "off-staff" | "off-client" | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<ShareAudience | null>(null);
  const [staffLink, setStaffLink] = useState("");
  const [clientLink, setClientLink] = useState("");

  async function copyText(url: string, audience: ShareAudience) {
    if (audience === "staff") setStaffLink(url);
    else setClientLink(url);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(audience);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  async function createOrCopy(audience: ShareAudience) {
    if (busy) return;
    setError(null);
    const isStaff = audience === "staff";
    const alreadyOn = isStaff ? enabled : clientEnabled;
    const token = isStaff ? shareToken : clientShareToken;
    if (alreadyOn && token) {
      await copyText(shareUrl(token), audience);
      return;
    }
    setBusy(audience);
    setCopied(null);
    try {
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_post_share",
          id: contentId,
          enabled: true,
          audience,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not create the link");
        return;
      }
      const nextToken = String(data.share_token ?? "");
      onUpdated({
        share_enabled: isStaff ? true : enabled,
        share_token: isStaff ? nextToken : shareToken || "",
        client_share_enabled: isStaff ? clientEnabled : true,
        client_share_token: isStaff ? clientShareToken || "" : nextToken,
      });
      if (data.path) {
        await copyText(`${window.location.origin}${data.path}`, audience);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the link");
    } finally {
      setBusy(null);
    }
  }

  async function turnOff(audience: ShareAudience) {
    if (busy) return;
    setBusy(audience === "staff" ? "off-staff" : "off-client");
    setError(null);
    setCopied(null);
    try {
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_post_share",
          id: contentId,
          enabled: false,
          audience,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not turn off the link");
        return;
      }
      const nextToken = String(data.share_token ?? "");
      if (audience === "staff") {
        onUpdated({
          share_enabled: false,
          share_token: nextToken || shareToken || "",
          client_share_enabled: clientEnabled,
          client_share_token: clientShareToken || "",
        });
        setStaffLink("");
      } else {
        onUpdated({
          share_enabled: enabled,
          share_token: shareToken || "",
          client_share_enabled: false,
          client_share_token: nextToken || clientShareToken || "",
        });
        setClientLink("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not turn off the link");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-brand">Share for approval</p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-secondary"
          disabled={!!busy}
          onClick={() => void createOrCopy("staff")}
        >
          <Link2 className="h-4 w-4" />
          {busy === "staff"
            ? "Creating…"
            : copied === "staff"
              ? "Staff link copied"
              : enabled
                ? "Copy staff link"
                : "Create staff link"}
        </button>
        {enabled ? (
          <button
            type="button"
            className="btn-ghost"
            disabled={!!busy}
            onClick={() => void turnOff("staff")}
          >
            Turn off staff
          </button>
        ) : null}
      </div>
      {staffLink ? (
        <p className="break-all text-xs text-slate-600">{staffLink}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-secondary"
          disabled={!!busy}
          onClick={() => void createOrCopy("client")}
        >
          <Link2 className="h-4 w-4" />
          {busy === "client"
            ? "Creating…"
            : copied === "client"
              ? "Client link copied"
              : clientEnabled
                ? "Copy client link"
                : "Create client link"}
        </button>
        {clientEnabled ? (
          <button
            type="button"
            className="btn-ghost"
            disabled={!!busy}
            onClick={() => void turnOff("client")}
          >
            Turn off client
          </button>
        ) : null}
      </div>
      {clientLink ? (
        <p className="break-all text-xs text-slate-600">{clientLink}</p>
      ) : null}
      {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
