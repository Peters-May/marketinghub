"use client";

import { useState } from "react";
import {
  addUtcDays,
  utcToday,
  type AiKeyPublicStatus,
} from "@/lib/ai/ai-key-status";

function formatUkDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function statusCopy(status: AiKeyPublicStatus): { tone: string; text: string } {
  if (!status.configured) {
    return {
      tone: "border-amber-200 bg-amber-50 text-amber-950",
      text: "No API key is saved. The hub assistant cannot run until one is added.",
    };
  }
  if (!status.expires_on || status.days_remaining === null) {
    return {
      tone: "border-amber-200 bg-amber-50 text-amber-950",
      text: "A key is in use, but no expiry date is saved. Set the date so the hub can remind you.",
    };
  }
  const when = formatUkDate(status.expires_on);
  if (status.status === "expired") {
    return {
      tone: "border-amber-300 bg-amber-50 text-amber-950",
      text:
        status.days_remaining < 0
          ? `This key expired on ${when}. Replace it before the assistant stops.`
          : `This key expires today (${when}). Replace it before the assistant stops.`,
    };
  }
  if (status.status === "urgent" || status.status === "soon") {
    return {
      tone: "border-amber-200 bg-amber-50 text-amber-950",
      text: `This key expires on ${when}. ${status.days_remaining} day${status.days_remaining === 1 ? "" : "s"} left.`,
    };
  }
  return {
      tone: "border-border bg-accent-soft/50 text-brand",
    text: `In use until ${when}. ${status.days_remaining} days left.`,
  };
}

export function AiKeyClient({ initial }: { initial: AiKeyPublicStatus }) {
  const [status, setStatus] = useState(initial);
  const [apiKey, setApiKey] = useState("");
  const [expiresOn, setExpiresOn] = useState(
    initial.expires_on || addUtcDays(utcToday(), 90)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const banner = statusCopy(status);
  const masked = status.key_hint ? `••••${status.key_hint}` : "Not saved";

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSaved("");
    try {
      const res = await fetch("/api/admin/ai-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          expires_on: expiresOn,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not save the key.");
        return;
      }
      setStatus(data.status);
      setExpiresOn(data.status.expires_on ?? "");
      setApiKey("");
      setSaved("Saved. The previous key is no longer shown.");
    } catch {
      setError("Could not save the key.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="max-w-xl space-y-4">
      <section className={`rounded-xl border px-4 py-3 text-sm ${banner.tone}`}>
        <p>{banner.text}</p>
        {status.source === "environment" ? (
          <p className="mt-2">
            The live key is still the server environment variable. Saving here
            stores a replacement in Admin, which the hub uses first.
          </p>
        ) : null}
      </section>

      <section className="surface-card space-y-4 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Current key
          </p>
          <p className="mt-1 font-mono text-sm text-brand">{masked}</p>
          {status.updated_by ? (
            <p className="mt-1 text-xs text-muted">
              Last updated by {status.updated_by}
            </p>
          ) : null}
        </div>

        <label className="block text-sm">
          <span className="text-muted">New API key</span>
          <input
            type="password"
            autoComplete="off"
            className="input mt-1 w-full font-mono"
            placeholder="sk-…"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
        </label>

        <label className="block text-sm">
          <span className="text-muted">Expires on</span>
          <input
            type="date"
            required
            className="input mt-1 w-full"
            value={expiresOn}
            onChange={(event) => setExpiresOn(event.target.value)}
          />
          <span className="mt-1 block text-xs text-muted">
            OpenAI project keys last 90 days. Leave the new key blank to change
            only the date.
          </span>
        </label>

        {error ? <p className="text-sm text-amber-800">{error}</p> : null}
        {saved ? <p className="text-sm text-brand">{saved}</p> : null}

        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save key"}
        </button>
      </section>

      <p className="text-sm text-muted">
        Marketing Hub emails admins and marketing@petersandmay.com at 14 days,
        7 days, 1 day, and on the expiry date. A task is added, and a reminder
        appears on the home page for the last two weeks.
      </p>
    </form>
  );
}
