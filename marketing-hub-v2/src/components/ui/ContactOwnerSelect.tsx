"use client";

import { useEffect, useState } from "react";
import { contactOwnerOptions } from "@/lib/data/collections";
import { createPersonContact } from "@/lib/contacts/create-person";
import {
  loadContactList,
  upsertCachedContact,
} from "@/lib/contacts/load-contacts";
import type { Contact } from "@/lib/types";
import { SearchSelect } from "@/components/ui/SearchSelect";

export function ContactOwnerSelect({
  value,
  onChange,
  className,
  id,
  disabled,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  className?: string;
  id?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadContactList()
      .then((next) => {
        if (!cancelled) setContacts(next);
      })
      .catch(() => {
        /* keep empty list */
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const options = contactOwnerOptions(contacts, value);

  return (
    <SearchSelect
      id={id}
      className={className}
      value={value}
      disabled={disabled || !loaded}
      aria-label={ariaLabel ?? "Owner"}
      allowEmpty
      emptyLabel={loaded ? "Assign person…" : "Loading…"}
      placeholder={loaded ? "Assign person…" : "Loading…"}
      searchPlaceholder="Search or add a person…"
      noResultsLabel="No matches — add them below"
      options={options}
      allowCreate
      createLabel={(name) => `Add “${name}” as a contact`}
      onCreate={async (name) => {
        const item = await createPersonContact(name);
        upsertCachedContact(item);
        setContacts((prev) =>
          prev.some((c) => c.id === item.id) ? prev : [...prev, item]
        );
        onChange(item.name);
      }}
      onChange={onChange}
    />
  );
}
