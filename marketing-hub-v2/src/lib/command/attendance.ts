export type ProposedPerson = {
  name: string;
  status: "attending" | "maybe";
};

/** Split "Simon, Cass, maybe Racing" into people. "TBC" is not a person. */
export function splitProposedAttendance(raw: string): {
  label: string;
  tbc: boolean;
  people: ProposedPerson[];
} {
  const label = raw.trim().replace(/[.]+$/g, "").trim();
  if (!label) return { label: "", tbc: false, people: [] };
  const parts = label
    .split(/\s*,\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
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
