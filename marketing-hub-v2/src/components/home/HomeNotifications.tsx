"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Item = {
  id: string;
  title: string;
  body: string;
  href: string;
  read_at: string | null;
};

export function HomeNotifications() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    void fetch("/api/notifications")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setItems((data.notifications ?? []).filter((item: Item) => !item.read_at).slice(0, 5));
      })
      .catch(() => undefined);
  }, []);

  if (items.length === 0) return null;

  return (
    <section className="surface-card mb-6 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-sky-100 bg-accent-soft/70 px-5 py-3 md:px-6">
        <span className="h-2 w-2 rounded-full bg-accent" aria-hidden />
        <h2 className="font-display text-lg text-brand">Reminders</h2>
        <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs font-semibold tabular-nums text-brand">
          {items.length}
        </span>
      </div>
      <ul className="grid gap-2 p-3 sm:p-4">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-background px-3 py-2.5"
          >
            <Link href={item.href} className="min-w-0">
              <span className="block font-medium">{item.title}</span>
              <span className="line-clamp-1 text-xs text-muted">{item.body}</span>
            </Link>
            <button
              type="button"
              className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-muted ring-1 ring-border hover:text-foreground"
              onClick={() => {
                void fetch("/api/notifications", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "read", id: item.id }),
                });
                setItems((prev) => prev.filter((row) => row.id !== item.id));
              }}
            >
              Dismiss
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
