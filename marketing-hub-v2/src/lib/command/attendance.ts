export type ProposedPerson = {
  name: string;
  status: "attending" | "maybe";
};

/** "A and B" and "A, B, and C" are separate people. "+ Team" stays one entry. */
function attendanceNameParts(label: string): string[] {
  const parts: string[] = [];
  for (const chunk of label.split(/\s*,\s*/)) {
    const trimmed = chunk.trim().replace(/^and\s+/i, "");
    if (!trimmed) continue;
    if (/\+|team\b/i.test(trimmed)) {
      parts.push(trimmed);
      continue;
    }
    for (const piece of trimmed.split(/\s+and\s+/i)) {
      const name = piece.trim();
      if (name) parts.push(name);
    }
  }
  return parts;
}

/** Split "Simon, Cass, maybe Racing" into people. "TBC" is not a person. */
export function splitProposedAttendance(raw: string): {
  label: string;
  tbc: boolean;
  people: ProposedPerson[];
} {
  const label = raw.trim().replace(/[.]+$/g, "").trim();
  if (!label) return { label: "", tbc: false, people: [] };
  const parts = attendanceNameParts(label);
  const people: ProposedPerson[] = [];
  let tbc = false;
  for (const part of parts) {
    if (/^tbc$/i.test(part)) {
      tbc = true;
      continue;
    }
    const maybe = part.match(/^maybe\s+(.+)$/i);
    if (maybe) {
      const name = maybe[1].trim();
      if (name) people.push({ name, status: "maybe" });
      continue;
    }
    people.push({ name: part, status: "attending" });
  }
  return { label, tbc, people };
}

/** Keep people already named, then append anyone new. */
export function mergeAttendanceLabel(existing: string, incoming: string): string {
  const current = splitProposedAttendance(existing);
  const next = splitProposedAttendance(incoming);
  if (!current.label) return next.label;
  const seen = new Set(
    current.people.map((person) => person.name.toLowerCase())
  );
  const extra = next.people.filter(
    (person) => !seen.has(person.name.toLowerCase())
  );
  if (!extra.length) return current.label;
  const suffix = extra
    .map((person) =>
      person.status === "maybe" ? `maybe ${person.name}` : person.name
    )
    .join(", ");
  return `${current.label}, ${suffix}`;
}

/** Stable id when a name does not match one contact or hub user. */
export function proposedAttendanceId(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `proposed:${slug || "person"}`;
}
