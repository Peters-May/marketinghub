"use client";

import type { StarterLayout } from "@/lib/email/design";

const STARTERS: { id: StarterLayout; label: string; description: string }[] = [
  {
    id: "blank",
    label: "Blank",
    description: "A simple text section and footer.",
  },
  {
    id: "newsletter",
    label: "Newsletter",
    description: "Logo, heading, body, button, and social links.",
  },
  {
    id: "announcement",
    label: "Announcement",
    description: "Centred update with image and call to action.",
  },
  {
    id: "press_pitch",
    label: "Press pitch",
    description:
      "Release email: logo, image, story, notes, newsroom links, boilerplate, media and contacts.",
  },
];

export function EmailStarterPicker({
  open,
  title,
  busy,
  layouts,
  onClose,
  onPick,
}: {
  open: boolean;
  title: string;
  busy?: boolean;
  /** Limit the choices. Email creation omits the press pitch layout. */
  layouts?: StarterLayout[];
  onClose: () => void;
  onPick: (layout: StarterLayout) => void;
}) {
  if (!open) return null;
  const choices = layouts
    ? STARTERS.filter((item) => layouts.includes(item.id))
    : STARTERS;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 md:left-sidebar">
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-white p-5 shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="email-starter-title"
      >
        <h2 id="email-starter-title" className="font-display text-xl text-brand">
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted">Choose a starting layout.</p>
        <ul className="mt-4 space-y-2">
          {choices.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                disabled={busy}
                className="flex w-full flex-col rounded-lg border border-border px-4 py-3 text-left hover:border-brand hover:bg-slate-50 disabled:opacity-50"
                onClick={() => onPick(item.id)}
              >
                <span className="font-medium text-brand">{item.label}</span>
                <span className="text-sm text-muted">{item.description}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
