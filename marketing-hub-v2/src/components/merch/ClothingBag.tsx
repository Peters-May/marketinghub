"use client";

import { useEffect, useMemo, useState } from "react";
import { isImageUrl } from "@/lib/social/platforms";
import { cn } from "@/lib/utils";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { FormAlert } from "@/components/ui/FormAlert";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { apiErrorMessage } from "@/lib/ui/form-feedback";
import {
  MERCH_FOR_OTHER,
  contactMerchForOptions,
} from "@/lib/merch/requested-for";
import { createPersonContact } from "@/lib/contacts/create-person";
import type { Contact, MerchOrder } from "@/lib/types";
import type { BagLineDraft } from "@/components/merch/ClothingProductDetail";

export function ClothingBag({
  lines,
  onChangeLines,
  onClose,
  onSubmitted,
  canManageAll,
  viewerName,
  viewerContactId,
  publicMode = false,
  standalone = false,
}: {
  lines: BagLineDraft[];
  onChangeLines: (next: BagLineDraft[]) => void;
  onClose: () => void;
  onSubmitted: (order: MerchOrder) => void;
  canManageAll: boolean;
  viewerName: string;
  viewerContactId: string | null;
  /** Guest checkout via public shop APIs. */
  publicMode?: boolean;
  standalone?: boolean;
}) {
  const [requestedFor, setRequestedFor] = useState(viewerName);
  const [requestedForContactId, setRequestedForContactId] = useState<
    string | null
  >(viewerContactId);
  const [forMode, setForMode] = useState<"me" | "other">("me");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [office, setOffice] = useState("Southampton");
  const [neededBy, setNeededBy] = useState("");
  const [notes, setNotes] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!canManageAll || publicMode) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/contacts");
        if (!res.ok) return;
        const data = (await res.json()) as { contacts?: Contact[] };
        if (!cancelled) setContacts(data.contacts ?? []);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canManageAll, publicMode]);

  const totalQty = useMemo(
    () => lines.reduce((sum, line) => sum + (line.quantity || 0), 0),
    [lines]
  );

  async function submit() {
    if (!lines.length) {
      setError("Add at least one item to your bag");
      return;
    }
    if (publicMode) {
      if (!guestName.trim()) {
        setError("Name is required");
        return;
      }
      if (!guestEmail.trim() || !guestEmail.includes("@")) {
        setError("A valid email is required");
        return;
      }
    }
    setSaving(true);
    setError("");
    try {
      const payloadItems = lines.map((line) => ({
        item: line.item,
        fit: line.fit,
        size: line.size,
        quantity: line.quantity,
        colour: line.colour,
        logo: line.logo,
      }));

      if (publicMode) {
        const res = await fetch("/api/public/shop/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: payloadItems,
            name: guestName.trim(),
            email: guestEmail.trim(),
            office,
            needed_by: neededBy || null,
            notes,
          }),
        });
        const data = (await res.json()) as { error?: string; item?: MerchOrder };
        if (!res.ok || !data.item) {
          setError(apiErrorMessage(data.error, "Could not submit order"));
          return;
        }
        onSubmitted(data.item);
        return;
      }

      const res = await fetch("/api/merch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: payloadItems,
          requested_for:
            forMode === "me" && !canManageAll ? viewerName : requestedFor,
          requested_for_contact_id:
            forMode === "me" && !canManageAll
              ? viewerContactId
              : requestedForContactId,
          office,
          needed_by: neededBy || null,
          notes,
          status: "requested",
        }),
      });
      const data = (await res.json()) as { error?: string; item?: MerchOrder };
      if (!res.ok || !data.item) {
        setError(apiErrorMessage(data.error, "Could not submit order"));
        return;
      }
      onSubmitted(data.item);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-50",
        standalone ? "" : "md:left-sidebar"
      )}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/30"
        aria-label="Close bag"
        onClick={onClose}
      />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-lg flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-display text-lg text-brand">
            Bag ({totalQty})
          </h2>
          <button type="button" className="btn-ghost px-2 py-1 text-sm" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {lines.length === 0 ? (
            <p className="text-sm text-muted">Your bag is empty.</p>
          ) : (
            <ul className="space-y-3">
              {lines.map((line, index) => (
                <li
                  key={`${line.productId}-${index}`}
                  className="flex gap-3 border-b border-border pb-3"
                >
                  <div className="h-20 w-16 shrink-0 overflow-hidden bg-[#E3E6E9]">
                    {line.image_url && isImageUrl(line.image_url) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={line.image_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {line.item}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {[line.colour, line.size, line.fit, line.logo]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        className="field w-16 py-1 text-xs"
                        type="number"
                        min={1}
                        value={line.quantity}
                        onChange={(e) => {
                          const qty = Math.max(1, Number(e.target.value) || 1);
                          onChangeLines(
                            lines.map((l, i) =>
                              i === index ? { ...l, quantity: qty } : l
                            )
                          );
                        }}
                      />
                      <button
                        type="button"
                        className="text-xs text-[var(--danger)]"
                        onClick={() =>
                          onChangeLines(lines.filter((_, i) => i !== index))
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="grid gap-3 border-t border-border pt-4">
            {publicMode ? (
              <>
                <div>
                  <label className="label">Your name</label>
                  <input
                    className="field"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Full name"
                    autoComplete="name"
                  />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input
                    className="field"
                    type="email"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    placeholder="you@company.com"
                    autoComplete="email"
                  />
                </div>
              </>
            ) : canManageAll ? (
              <div>
                <label className="label">For</label>
                <SearchSelect
                  className="field"
                  value={requestedForContactId || MERCH_FOR_OTHER}
                  options={contactMerchForOptions(
                    contacts,
                    requestedForContactId,
                    requestedFor
                  )}
                  allowCreate
                  createLabel={(name) => `Add “${name}” as a contact`}
                  onCreate={async (name) => {
                    const item = await createPersonContact(name);
                    setContacts((prev) =>
                      prev.some((c) => c.id === item.id)
                        ? prev
                        : [...prev, item]
                    );
                    setRequestedForContactId(item.id);
                    setRequestedFor(item.name);
                    setForMode("other");
                  }}
                  onChange={(value) => {
                    if (value === MERCH_FOR_OTHER) {
                      setRequestedForContactId(null);
                      setForMode("other");
                      return;
                    }
                    const contact = contacts.find((c) => c.id === value);
                    setRequestedForContactId(value);
                    setRequestedFor(contact?.name || requestedFor);
                    setForMode("other");
                  }}
                />
                {!requestedForContactId ? (
                  <input
                    className="field mt-2"
                    placeholder="Name"
                    value={requestedFor}
                    onChange={(e) => setRequestedFor(e.target.value)}
                  />
                ) : null}
              </div>
            ) : (
              <div>
                <label className="label">For</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={
                      forMode === "me" ? "btn-primary text-xs" : "btn-secondary text-xs"
                    }
                    onClick={() => {
                      setForMode("me");
                      setRequestedFor(viewerName);
                      setRequestedForContactId(viewerContactId);
                    }}
                  >
                    Myself
                  </button>
                  <button
                    type="button"
                    className={
                      forMode === "other"
                        ? "btn-primary text-xs"
                        : "btn-secondary text-xs"
                    }
                    onClick={() => {
                      setForMode("other");
                      setRequestedForContactId(null);
                    }}
                  >
                    Someone else
                  </button>
                </div>
                {forMode === "other" ? (
                  <input
                    className="field mt-2"
                    placeholder="Name"
                    value={requestedFor}
                    onChange={(e) => setRequestedFor(e.target.value)}
                  />
                ) : null}
              </div>
            )}

            <div>
              <label className="label">Office</label>
              <input
                className="field"
                value={office}
                onChange={(e) => setOffice(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Needed by</label>
              <input
                className="field"
                type="date"
                value={neededBy}
                onChange={(e) => setNeededBy(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Notes</label>
              {publicMode ? (
                <textarea
                  className="field min-h-[88px] resize-y"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Anything Marketing should know…"
                />
              ) : (
                <RichTextEditor
                  value={notes}
                  onChange={setNotes}
                  placeholder="Anything Marketing should know…"
                  minHeight="70px"
                />
              )}
            </div>
          </div>

          <FormAlert message={error || null} />
        </div>

        <div className="border-t border-border p-4">
          <button
            type="button"
            disabled={saving || lines.length === 0}
            onClick={() => void submit()}
            className="w-full bg-[#0B2545] px-4 py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-[#071A2E] disabled:opacity-50"
          >
            {saving ? "Submitting…" : "Submit request"}
          </button>
          <p className="mt-2 text-center text-[11px] text-muted">
            No payment — Marketing will fulfil your clothing request.
          </p>
        </div>
      </div>
    </div>
  );
}
