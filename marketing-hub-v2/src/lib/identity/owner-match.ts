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

/** Dashboard and task filters. First name matches either way when the other side is a single name. */
export function ownerMatchesViewer(
  owner: string | null | undefined,
  ownerUserId: string | null | undefined,
  viewer: { id: string; fullName: string }
) {
  if (ownerUserId && ownerUserId === viewer.id) return true;
  const name = normaliseOwnerName(owner);
  const full = normaliseOwnerName(viewer.fullName);
  if (!name || !full) return false;
  if (name === full) return true;
  const ownerParts = name.split(/\s+/);
  const viewerParts = full.split(/\s+/);
  const ownerFirst = ownerParts[0] ?? "";
  const viewerFirst = viewerParts[0] ?? "";
  if (ownerFirst.length <= 1 || viewerFirst.length <= 1) return false;
  if (ownerFirst !== viewerFirst) return false;
  return ownerParts.length === 1 || viewerParts.length === 1;
}
