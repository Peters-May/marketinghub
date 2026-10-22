export type OwnerDirectoryEntry = {
  id: string;
  full_name: string;
};

export function normaliseOwnerName(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Unique full-name match only. A shared first name, or two people with the
 * same name, is left unset so the backfill cannot attach the wrong user.
 */
export function matchOwnerUserId(
  owner: string | null | undefined,
  people: OwnerDirectoryEntry[]
): string | null {
  const name = normaliseOwnerName(owner);
  if (!name) return null;
  const matches = people.filter(
    (person) => normaliseOwnerName(person.full_name) === name
  );
  if (matches.length !== 1) return null;
  return matches[0].id;
}

/** Dashboard and task filters. First name matches the signed-in person only. */
export function ownerMatchesViewer(
  owner: string | null | undefined,
  ownerUserId: string | null | undefined,
  viewer: { id: string; fullName: string }
) {
  if (ownerUserId && ownerUserId === viewer.id) return true;
  const name = normaliseOwnerName(owner);
  if (!name) return false;
  const full = normaliseOwnerName(viewer.fullName);
  if (full && name === full) return true;
  const first = full.split(/\s+/)[0] ?? "";
  return first.length > 1 && name === first;
}
