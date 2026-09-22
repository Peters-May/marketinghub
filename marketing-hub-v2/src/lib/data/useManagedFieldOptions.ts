"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ensureFieldOption,
  optionsForField,
  type FieldOption,
} from "@/lib/data/collections";

/**
 * Keep Field Manager options fresh on hub pages.
 * SSR props are a starting point; we re-fetch so option edits show up
 * without requiring a full hard reload.
 */
export function useManagedFieldOptions(
  collection: string,
  initial?: Record<string, FieldOption[]>
) {
  const [fieldOptions, setFieldOptions] = useState<
    Record<string, FieldOption[]>
  >(initial ?? {});

  useEffect(() => {
    setFieldOptions(initial ?? {});
  }, [initial]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/data?collection=${encodeURIComponent(collection)}&fieldsOnly=1`
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (
          !cancelled &&
          data.fieldOptions &&
          typeof data.fieldOptions === "object"
        ) {
          setFieldOptions(data.fieldOptions as Record<string, FieldOption[]>);
        }
      } catch {
        // Keep SSR / previous options on failure.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [collection]);

  return fieldOptions;
}

/** Persist a new select option so it appears for everyone (staff-allowed). */
export async function persistSelectOption(
  collection: string,
  fieldKey: string,
  value: string
): Promise<boolean> {
  const label = value.trim();
  if (!label || !collection || !fieldKey) return false;
  try {
    const res = await fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "addSelectOption",
        collection,
        key: fieldKey,
        value: label,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Select options that can be created inline. New values stay in the
 * dropdown immediately and are persisted to Field Manager when possible.
 */
export function useCreatableSelectOptions(
  collection: string,
  fieldKey: string,
  fieldOptions: Record<string, FieldOption[]>,
  fallback: FieldOption[]
) {
  const [created, setCreated] = useState<FieldOption[]>([]);
  const options = useMemo(
    () =>
      created.reduce(
        (acc, option) => ensureFieldOption(acc, option),
        optionsForField(fieldOptions, fieldKey, fallback)
      ),
    [created, fieldOptions, fieldKey, fallback]
  );

  const addOption = useCallback(
    (raw: string) => {
      const label = raw.trim();
      if (!label) return "";
      setCreated((prev) => ensureFieldOption(prev, { value: label, label }));
      void persistSelectOption(collection, fieldKey, label);
      return label;
    },
    [collection, fieldKey]
  );

  return { options, addOption };
}
