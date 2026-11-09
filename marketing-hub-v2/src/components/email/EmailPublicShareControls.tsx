"use client";

import { useState } from "react";
import type { ShareAudience } from "@/lib/types";

export function EmailPublicShareControls({
  kind,
  id,
  initialEnabled,
  initialPath = "",
  initialClientEnabled = false,
  initialClientPath = "",
  layout,
  allowEnable = true,
  takeDraft,
  restoreDraft,
  onNote,
  onError,
  onEnabledChange,
  onPathChange,
  onClientEnabledChange,
  onClientPathChange,
  onDone,
}: {
  kind: "template" | "campaign";
  id: string;
  initialEnabled: boolean;
  /** Known public path, so a later copy does not wait on a save. */
  initialPath?: string;
  initialClientEnabled?: boolean;
  initialClientPath?: string;
  layout: "menu" | "inline";
  /** When false, an existing link can be copied or turned off, not created. */
  allowEnable?: boolean;
  /**
   * Unsaved draft fields to store with the link. Null when the draft is
   * already saved. Clears the dirty flag; call restoreDraft if the write fails.
   */
  takeDraft?: () => Record<string, unknown> | null;
  restoreDraft?: () => void;
  onNote?: (message: string) => void;
  onError?: (message: string) => void;
  onEnabledChange?: (enabled: boolean) => void;
  onPathChange?: (path: string) => void;
  onClientEnabledChange?: (enabled: boolean) => void;
  onClientPathChange?: (path: string) => void;
  onDone?: () => void;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [path, setPath] = useState(initialPath);
  const [clientEnabled, setClientEnabled] = useState(initialClientEnabled);
  const [clientPath, setClientPath] = useState(initialClientPath);
  const [busy, setBusy] = useState(false);
  const [localNote, setLocalNote] = useState("");
  const [localError, setLocalError] = useState("");

  if (!allowEnable && !enabled && !clientEnabled) return null;

  function reportNote(message: string) {
    setLocalError("");
    setLocalNote(message);
    onNote?.(message);
  }

  function reportError(message: string) {
    setLocalNote("");
    setLocalError(message);
    onError?.(message);
  }

  async function post(
    next: boolean,
    audience: ShareAudience,
    patch?: Record<string, unknown> | null
  ) {
    const res = await fetch(
      kind === "template" ? "/api/email/templates" : "/api/email/campaigns",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_share",
          id,
          enabled: next,
          audience,
          ...(next && patch ? { patch } : {}),
        }),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Could not update the share link");
    }
    return data as { path?: string; share_enabled?: boolean };
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  async function enableAndCopy(audience: ShareAudience) {
    if (busy) return;
    const isStaff = audience === "staff";
    const currentEnabled = isStaff ? enabled : clientEnabled;
    const currentPath = isStaff ? path : clientPath;
    const draft = takeDraft?.() ?? null;
    if (currentEnabled && currentPath && !draft) {
      await copyUrl(`${window.location.origin}${currentPath}`);
      reportNote(
        `${isStaff ? "Staff" : "Client"} approval link copied. Anyone with the link can review this draft.`
      );
      onDone?.();
      return;
    }
    setBusy(true);
    try {
      const data = await post(true, audience, draft);
      const nextPath = String(data.path ?? "");
      if (!nextPath) throw new Error("Could not create the link");
      if (isStaff) {
        setPath(nextPath);
        onPathChange?.(nextPath);
        setEnabled(true);
        onEnabledChange?.(true);
      } else {
        setClientPath(nextPath);
        onClientPathChange?.(nextPath);
        setClientEnabled(true);
        onClientEnabledChange?.(true);
      }
      await copyUrl(`${window.location.origin}${nextPath}`);
      reportNote(
        `${isStaff ? "Staff" : "Client"} approval link copied. Anyone with the link can review this draft.`
      );
      onDone?.();
    } catch (err) {
      if (draft) restoreDraft?.();
      reportError(
        err instanceof Error ? err.message : "Could not create the link"
      );
    } finally {
      setBusy(false);
    }
  }

  async function turnOff(audience: ShareAudience) {
    if (busy) return;
    setBusy(true);
    try {
      await post(false, audience);
      if (audience === "staff") {
        setPath("");
        onPathChange?.("");
        setEnabled(false);
        onEnabledChange?.(false);
        reportNote("Staff approval link turned off.");
      } else {
        setClientPath("");
        onClientPathChange?.("");
        setClientEnabled(false);
        onClientEnabledChange?.(false);
        reportNote("Client approval link turned off.");
      }
      onDone?.();
    } catch (err) {
      reportError(
        err instanceof Error ? err.message : "Could not turn off the link"
      );
    } finally {
      setBusy(false);
    }
  }

  const itemClass =
    "block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-60";

  if (layout === "menu") {
    return (
      <>
        <div className="my-1 border-t border-border" />
        <p className="px-3 py-1 text-xs text-muted">
          Share for approval — staff and client links.
        </p>
        {allowEnable || enabled ? (
          <button
            type="button"
            className={itemClass}
            disabled={busy || (!allowEnable && !enabled)}
            onClick={() => void enableAndCopy("staff")}
          >
            {busy
              ? "Working…"
              : enabled
                ? "Copy staff approval link"
                : "Create staff approval link"}
          </button>
        ) : null}
        {enabled ? (
          <button
            type="button"
            className={itemClass}
            disabled={busy}
            onClick={() => void turnOff("staff")}
          >
            Turn off staff link
          </button>
        ) : null}
        {allowEnable || clientEnabled ? (
          <button
            type="button"
            className={itemClass}
            disabled={busy || (!allowEnable && !clientEnabled)}
            onClick={() => void enableAndCopy("client")}
          >
            {busy
              ? "Working…"
              : clientEnabled
                ? "Copy client approval link"
                : "Create client approval link"}
          </button>
        ) : null}
        {clientEnabled ? (
          <button
            type="button"
            className={itemClass}
            disabled={busy}
            onClick={() => void turnOff("client")}
          >
            Turn off client link
          </button>
        ) : null}
      </>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-secondary px-3 py-1.5 text-sm"
          disabled={busy}
          onClick={() => void enableAndCopy("staff")}
        >
          {busy
            ? "Working…"
            : enabled
              ? "Copy staff approval link"
              : "Create staff approval link"}
        </button>
        {enabled ? (
          <button
            type="button"
            className="btn-ghost px-3 py-1.5 text-sm"
            disabled={busy}
            onClick={() => void turnOff("staff")}
          >
            Turn off staff
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-secondary px-3 py-1.5 text-sm"
          disabled={busy}
          onClick={() => void enableAndCopy("client")}
        >
          {busy
            ? "Working…"
            : clientEnabled
              ? "Copy client approval link"
              : "Create client approval link"}
        </button>
        {clientEnabled ? (
          <button
            type="button"
            className="btn-ghost px-3 py-1.5 text-sm"
            disabled={busy}
            onClick={() => void turnOff("client")}
          >
            Turn off client
          </button>
        ) : null}
      </div>
      {localNote ? (
        <p className="w-full text-xs text-muted">{localNote}</p>
      ) : null}
      {localError ? (
        <p className="w-full text-xs text-red-700">{localError}</p>
      ) : null}
    </div>
  );
}
