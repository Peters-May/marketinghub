"use client";

import { useState } from "react";

export function EmailPublicShareControls({
  kind,
  id,
  initialEnabled,
  initialPath = "",
  layout,
  allowEnable = true,
  takeDraft,
  restoreDraft,
  onNote,
  onError,
  onEnabledChange,
  onPathChange,
  onDone,
}: {
  kind: "template" | "campaign";
  id: string;
  initialEnabled: boolean;
  /** Known public path, so a later copy does not wait on a save. */
  initialPath?: string;
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
  onDone?: () => void;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [path, setPath] = useState(initialPath);
  const [busy, setBusy] = useState(false);
  const [localNote, setLocalNote] = useState("");
  const [localError, setLocalError] = useState("");

  if (!allowEnable && !enabled) return null;

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

  async function post(next: boolean, patch?: Record<string, unknown> | null) {
    const res = await fetch(
      kind === "template" ? "/api/email/templates" : "/api/email/campaigns",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_share",
          id,
          enabled: next,
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

  function publishEnabled(next: boolean) {
    setEnabled(next);
    onEnabledChange?.(next);
  }

  function rememberPath(next: string) {
    setPath(next);
    onPathChange?.(next);
  }

  async function enableAndCopy() {
    if (busy) return;
    const draft = takeDraft?.() ?? null;
    if (enabled && path && !draft) {
      await copyUrl(`${window.location.origin}${path}`);
      reportNote(
        "Public link copied. Anyone with the link can view this draft."
      );
      onDone?.();
      return;
    }
    setBusy(true);
    try {
      const data = await post(true, draft);
      const nextPath = String(data.path ?? "");
      if (!nextPath) throw new Error("Could not create the link");
      rememberPath(nextPath);
      await copyUrl(`${window.location.origin}${nextPath}`);
      publishEnabled(true);
      reportNote(
        "Public link copied. Anyone with the link can view this draft."
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

  async function turnOff() {
    if (busy) return;
    setBusy(true);
    try {
      await post(false);
      rememberPath("");
      publishEnabled(false);
      reportNote("Public link turned off.");
      onDone?.();
    } catch (err) {
      reportError(
        err instanceof Error ? err.message : "Could not turn off the link"
      );
    } finally {
      setBusy(false);
    }
  }

  const enableLabel = busy
    ? "Working…"
    : enabled
      ? "Copy public link"
      : "Make share link public";
  const itemClass =
    "block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-60";

  if (layout === "menu") {
    return (
      <>
        <div className="my-1 border-t border-border" />
        <p className="px-3 py-1 text-xs text-muted">
          {enabled
            ? "Public link is on. No sign-in required."
            : "Share this draft outside the Hub."}
        </p>
        {allowEnable || enabled ? (
          <button
            type="button"
            className={itemClass}
            disabled={busy || (!allowEnable && !enabled)}
            onClick={() => void enableAndCopy()}
          >
            {enableLabel}
          </button>
        ) : null}
        {enabled ? (
          <button
            type="button"
            className={itemClass}
            disabled={busy}
            onClick={() => void turnOff()}
          >
            Turn off public link
          </button>
        ) : null}
      </>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="btn-secondary px-3 py-1.5 text-sm"
        disabled={busy}
        onClick={() => void enableAndCopy()}
      >
        {enableLabel}
      </button>
      {enabled ? (
        <button
          type="button"
          className="btn-ghost px-3 py-1.5 text-sm"
          disabled={busy}
          onClick={() => void turnOff()}
        >
          Turn off public link
        </button>
      ) : null}
      {localNote ? (
        <p className="w-full text-xs text-muted">{localNote}</p>
      ) : null}
      {localError ? (
        <p className="w-full text-xs text-red-700">{localError}</p>
      ) : null}
    </div>
  );
}
