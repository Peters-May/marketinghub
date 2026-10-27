"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EmailStarterPicker } from "@/components/email/EmailStarterPicker";
import {
  compileEmailDesign,
  pressPitchDesign,
  starterDesign,
  type StarterLayout,
} from "@/lib/email/design";
import { PRESS_PITCH_TEMPLATE_ID } from "@/lib/pr/pitch-email";

type Kind = "pitch" | "marketing";

const KINDS: { id: Kind; label: string; description: string }[] = [
  {
    id: "pitch",
    label: "Pitch email",
    description:
      "Opens in the email designer with the press pitch layout, and is listed under Pitches.",
  },
  {
    id: "marketing",
    label: "Marketing email",
    description:
      "Choose a layout, then open the email designer. It is listed under Email.",
  },
];

export function CreateEmailDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"kind" | "layout">("kind");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) return;
    setStep("kind");
    setBusy(false);
    setError("");
  }, [open]);

  async function create(kind: Kind, layout?: StarterLayout) {
    setBusy(true);
    setError("");
    const design =
      kind === "pitch" ? pressPitchDesign() : starterDesign(layout ?? "blank");
    const payload =
      kind === "pitch"
        ? {
            title: "Untitled pitch",
            subject: "",
            preview_text: "",
            from_name: "Peters & May Marketing",
            from_email: "marketing@petersandmay.com",
            design,
            html_body: compileEmailDesign(design),
            template_id: PRESS_PITCH_TEMPLATE_ID,
            folder: "Press",
            category: "pitch",
          }
        : {
            title: "Untitled email",
            subject: "",
            preview_text: "",
            design,
            html_body: compileEmailDesign(design),
            category: "marketing",
          };
    try {
      const res = await fetch("/api/email/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create the email");
      router.push(`/app/email/design/campaign/${data.item.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the email");
      setBusy(false);
    }
  }

  if (!open) return null;

  if (step === "layout") {
    return (
      <EmailStarterPicker
        open
        title="Marketing email"
        busy={busy}
        error={error}
        closeLabel="Back"
        layouts={["blank", "newsletter", "announcement"]}
        onClose={() => {
          if (busy) return;
          setError("");
          setStep("kind");
        }}
        onPick={(layout) => void create("marketing", layout)}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 md:left-sidebar">
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-white p-5 shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-email-kind-title"
      >
        <h2 id="create-email-kind-title" className="font-display text-xl text-brand">
          New email
        </h2>
        <p className="mt-1 text-sm text-muted">
          Is this a pitch email or a marketing email?
        </p>
        <ul className="mt-4 space-y-2">
          {KINDS.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                disabled={busy}
                className="flex w-full flex-col rounded-lg border border-border px-4 py-3 text-left hover:border-brand hover:bg-slate-50 disabled:opacity-50"
                onClick={() => {
                  setError("");
                  if (item.id === "pitch") {
                    void create("pitch");
                    return;
                  }
                  setStep("layout");
                }}
              >
                <span className="font-medium text-brand">
                  {busy && item.id === "pitch" ? "Creating…" : item.label}
                </span>
                <span className="text-sm text-muted">{item.description}</span>
              </button>
            </li>
          ))}
        </ul>
        {error ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}
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
