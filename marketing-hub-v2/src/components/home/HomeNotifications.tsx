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
    <section className="surface-card mb-6">
      <div className="border-b border-border px-5 py-3 md:px-6">
        <h2 className="font-display text-lg text-brand">Reminders</h2>
      </div>
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 md:px-6">
            <Link href={item.href} className="min-w-0">
              <span className="block font-medium">{item.title}</span>
              <span className="text-xs text-muted">{item.body}</span>
            </Link>
            <button
              type="button"
              className="text-xs text-muted underline"
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
