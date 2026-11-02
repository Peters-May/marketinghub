"use client";

import { useEffect } from "react";

export function PasteHtmlDialog({
  open,
  html,
  error,
  confirming,
  onHtml,
  onCancel,
  onBack,
  onImport,
}: {
  open: boolean;
  html: string;
  error: string;
  confirming: boolean;
  onHtml: (value: string) => void;
  onCancel: () => void;
  onBack: () => void;
  onImport: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 md:left-sidebar">
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-white p-5 shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="paste-html-title"
      >
        <h2 id="paste-html-title" className="font-display text-xl text-brand">
          Paste HTML
        </h2>
        {confirming ? (
          <p className="mt-2 text-sm text-muted">
            This replaces the current layout. Locked header and footer stay in place.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted">
              Headings, text, images, and buttons become modules you can edit. Anything else stays
              in an HTML module.
            </p>
            <textarea
              className="input mt-4 h-56 w-full resize-y font-mono text-xs"
              aria-label="HTML to import"
              value={html}
              onChange={(event) => onHtml(event.target.value)}
            />
          </>
        )}
        {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          {confirming ? (
            <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={onBack}>
              Back
            </button>
          ) : (
            <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button type="button" className="btn-primary px-3 py-1.5 text-sm" onClick={onImport}>
            {confirming ? "Replace" : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}
