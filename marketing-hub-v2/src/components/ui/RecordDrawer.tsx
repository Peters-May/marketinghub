"use client";

import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

export type RecordDrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Accessible name when title alone is insufficient. */
  ariaLabel?: string;
  /** Optional subtitle under the title (e.g. submission id). */
  subtitle?: ReactNode;
  banner?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Extra classes on the panel (e.g. max-w-xl). */
  className?: string;
};

export function RecordDrawer({
  open,
  onClose,
  title,
  ariaLabel,
  subtitle,
  banner,
  children,
  footer,
  className,
}: RecordDrawerProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !panelRef.current) return;
    const panel = panelRef.current;
    const focusables = panel.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusables[0]?.focus();

    const onTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    panel.addEventListener("keydown", onTab);
    return () => panel.removeEventListener("keydown", onTab);
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/25 md:left-sidebar"
        onClick={onClose}
        aria-hidden
      />
      <aside
        ref={panelRef}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-white shadow-soft",
          className
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-label={ariaLabel}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-sm font-semibold text-brand">
              {title}
            </h2>
            {subtitle ? (
              <div className="mt-0.5 text-xs text-muted">{subtitle}</div>
            ) : null}
          </div>
          <button
            type="button"
            className="btn-ghost shrink-0 px-2.5 py-1.5 text-xs"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        {banner}
        <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4 [&>*]:min-w-0 [&>*]:max-w-full">
          {children}
        </div>
        {footer ? (
          <div className="border-t border-border px-4 py-3">{footer}</div>
        ) : null}
      </aside>
    </>
  );
}
