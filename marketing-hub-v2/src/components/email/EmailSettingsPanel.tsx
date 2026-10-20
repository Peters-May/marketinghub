"use client";

import { useEffect, useState } from "react";
import type { EmailSettings } from "@/lib/types";
import { DEFAULT_EMAIL_SETTINGS } from "@/lib/email/email-settings";
import { cn } from "@/lib/utils";

type PagePreview = "unsubscribe" | "preferences";

const PREVIEW_URLS: Record<PagePreview, string> = {
  unsubscribe: "/unsubscribe?preview=1&view=unsubscribe",
  preferences: "/unsubscribe?preview=1&view=preferences",
};

export function EmailSettingsPanel() {
  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState("");
  const [pagePreview, setPagePreview] = useState<PagePreview>("unsubscribe");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/email/settings");
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || "Could not load settings.");
          setSettings({
            ...DEFAULT_EMAIL_SETTINGS,
            updated_at: new Date().toISOString(),
          });
          return;
        }
        setSettings(data.settings);
      } catch {
        if (!cancelled) {
          setError("Could not load settings.");
          setSettings({
            ...DEFAULT_EMAIL_SETTINGS,
            updated_at: new Date().toISOString(),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(patch: Partial<EmailSettings>) {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/email/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patch }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not save settings.");
        return;
      }
      setSettings(data.settings);
      setSavedAt(new Date().toLocaleTimeString());
    } catch {
      setError("Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return <p className="text-sm text-muted">Loading settings…</p>;
  }

  const previewUrl = PREVIEW_URLS[pagePreview];

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <section className="space-y-3 rounded-lg border border-border bg-white p-4">
        <h2 className="font-display text-lg text-brand">
          Unsubscribe &amp; preferences
        </h2>
        <p className="text-sm text-muted">
          Footer links on every marketing email. Preview on the right shows the
          page recipients land on.
        </p>
        <p className="text-sm font-medium text-brand">Footer link labels</p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.show_unsubscribe_link}
            onChange={(event) =>
              void save({ show_unsubscribe_link: event.target.checked })
            }
          />
          Show unsubscribe link
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.show_preferences_link}
            onChange={(event) =>
              void save({ show_preferences_link: event.target.checked })
            }
          />
          Show manage preferences link
        </label>
        <label className="block text-sm">
          <span className="text-muted">Unsubscribe label</span>
          <input
            className="input mt-1 w-full"
            value={settings.unsubscribe_label}
            onChange={(event) =>
              setSettings({ ...settings, unsubscribe_label: event.target.value })
            }
            onBlur={(event) =>
              void save({ unsubscribe_label: event.target.value })
            }
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted">Preferences label</span>
          <input
            className="input mt-1 w-full"
            value={settings.preferences_label}
            onChange={(event) =>
              setSettings({ ...settings, preferences_label: event.target.value })
            }
            onBlur={(event) =>
              void save({ preferences_label: event.target.value })
            }
          />
        </label>
        {saving ? (
          <p className="text-xs text-muted">Saving…</p>
        ) : savedAt ? (
          <p className="text-xs text-muted">Saved {savedAt}</p>
        ) : null}
        {error ? <p className="text-xs text-red-700">{error}</p> : null}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-brand">Page recipients see</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={cn(
                "rounded border px-3 py-1.5 text-sm",
                pagePreview === "unsubscribe"
                  ? "border-[#007DC5] text-[#007DC5]"
                  : "border-border text-muted"
              )}
              onClick={() => setPagePreview("unsubscribe")}
            >
              Unsubscribe
            </button>
            <button
              type="button"
              className={cn(
                "rounded border px-3 py-1.5 text-sm",
                pagePreview === "preferences"
                  ? "border-[#007DC5] text-[#007DC5]"
                  : "border-border text-muted"
              )}
              onClick={() => setPagePreview("preferences")}
            >
              Preferences
            </button>
            <a
              href={previewUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary text-sm"
            >
              Open full page
            </a>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-[var(--background)] shadow-sm">
          <iframe
            key={previewUrl}
            title={
              pagePreview === "preferences"
                ? "Email preferences page preview"
                : "Unsubscribe page preview"
            }
            src={previewUrl}
            className="h-[min(70vh,720px)] w-full bg-white"
          />
        </div>
      </section>
    </div>
  );
}
