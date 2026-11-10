/** Original corporate clothing issue — structured for year tables. */

export type IssuedKitLine = {
  id: string;
  item: string;
  size: string;
  quantity: number;
  colour: string;
  note: string;
};

export type IssuedKitPerson = {
  id: string;
  name: string;
  year: number;
  lines: IssuedKitLine[];
  source: "original" | "delivered" | "manual";
  merch_order_id: string | null;
  created_at: string;
  updated_at: string;
};

type LegacyClothingRecord = {
  name: string;
  clothing: string;
};

const LEGACY_RECORDS: LegacyClothingRecord[] = [
  {
    name: "Cassandre Avery",
    clothing: "Collared Shirt – S White; Gilet – M",
  },
  {
    name: "Nicky Bull",
    clothing: "Sailor Jacket – L; Navy Regatta – L; White Regatta – L",
  },
  {
    name: "Giulia",
    clothing: "Awaiting confirmation – no items recorded",
  },
  {
    name: "Kristina",
    clothing: "Navy Regatta – M",
  },
  {
    name: "Pierpaolo",
    clothing: "Awaiting confirmation – no items recorded",
  },
  {
    name: "Nazaret Cabanero",
    clothing: "Sailor Jacket – S; Gilet – S",
  },
  {
    name: "Ai Xing",
    clothing:
      "Sailor Jacket – M; Collared Shirt – M Blue; Navy Regatta – M; Gilet – M",
  },
  {
    name: "Paul Elsom",
    clothing: "Navy Regatta – 2 × XXL; Gilet – XXL",
  },
  {
    name: "Victoria Busquets",
    clothing: "Sailor Jacket – S; Gilet – S",
  },
  {
    name: "Daniel Elsom",
    clothing:
      "Collared Shirt – M Blue; Navy Regatta – L; White Regatta – M; Gilet – L",
  },
  {
    name: "Lindsey Ashdown",
    clothing: "No items recorded",
  },
  {
    name: "Robert Blades",
    clothing: "Collared Shirt – M; Navy Regatta – M; Gilet – M",
  },
  {
    name: "Craig Stanbury",
    clothing: "Sailor Jacket – XXL; Collared Shirt – X (size unclear); Gilet – XXL",
  },
  {
    name: "Simon Judson",
    clothing: "Sailor Jacket – XXL; Collared Shirt – XL/L; Gilet – XL",
  },
  {
    name: "Luke Webster",
    clothing: "Sailor Jacket – M; Navy Regatta – M; Gilet – M",
  },
  {
    name: "Nathan Lemoine",
    clothing: "Sailor Jacket – L; Gilet – L",
  },
  {
    name: "Kyle Morant",
    clothing: "Sailor Jacket – L; Collared Shirt – M; Navy Regatta – L",
  },
  {
    name: "Richard Howatt",
    clothing:
      "Sailor Jacket – M; Collared Shirts – 2 × M (1 Yacht Transport); Navy Regatta – M; White Regatta – L",
  },
  {
    name: "Paul Everley",
    clothing: "Sailor Jacket – L",
  },
  {
    name: "Darren Catteral",
    clothing: "Sailor Jacket – XL; Navy Regatta – L",
  },
  {
    name: "Ana Navarro",
    clothing: "Sailor Jacket – XL; Navy Regatta – XL; Gilet – XL",
  },
  {
    name: "Steve Franklyn",
    clothing: "Navy Regatta – XXL; White Regatta – XXL; Gilet – XXL (Awaiting Item)",
  },
  {
    name: "Gordon de Beer",
    clothing: "No items recorded",
  },
  {
    name: "Sergee van der Pligt",
    clothing:
      "Sailor Jacket – L; Collared Shirt – L; Navy Regatta – L; White Regatta – L; Gilet – L; Navy Polo – 2XL (January); Jumper – L; Gilet – L; White Regatta – L (September)",
  },
  {
    name: "Stefano Grotti",
    clothing:
      "Sailor Jacket – L; Collared Shirt – L; Navy Regatta – L; White Regatta – L; Gilet – XL",
  },
  {
    name: "Elo Romero",
    clothing: "Sailor Jacket – M; Gilet – S",
  },
  {
    name: "Luca Curreli",
    clothing:
      "Sailor Jacket – M; Collared Shirt – M; White Regatta – M; White Pique – M; Gilet – M",
  },
  {
    name: "Inma Requeni",
    clothing: "Collared Shirt – L; Gilet – L",
  },
  {
    name: "Loic Doudeau",
    clothing: "Collared Shirt – M; White Regatta – M; Gilet – M",
  },
  {
    name: "Michael Wood",
    clothing: "Navy Regatta – L; Gilet – L",
  },
  {
    name: "Pascal Cantaix",
    clothing: "Collared Shirt – L; White Pique – XL; Gilet – XL",
  },
  {
    name: "Anthony Spillebeen",
    clothing: "Sailor Jacket – M; Navy Regatta – 2 × M; Gilet – M",
  },
  {
    name: "Alexandra Gila",
    clothing: "Sailor Jacket – XS",
  },
  {
    name: "Chris Perez",
    clothing: "Collared Shirt – L; Navy Pique – XL; Gilet – XL",
  },
  {
    name: "Rasmus",
    clothing: "Navy Regatta – 2 × L",
  },
  {
    name: "Jack Van Marter",
    clothing: "Navy Regatta – L",
  },
  {
    name: "Inge Valk",
    clothing: "Sailor Jacket – XL; Collared Shirt – XL; Navy Regatta – XL",
  },
  {
    name: "Sham",
    clothing: "Sailor Jacket – XL; Navy Regatta – XL; Gilet – XL",
  },
  {
    name: "Jack McCarthy",
    clothing: "Sailor Jacket – L; Collared Shirt – L; Navy Regatta – L; Gilet – L",
  },
  {
    name: "Charles Hazet",
    clothing: "Sailor Jacket – L; Collared Shirt – L; Navy Regatta – L; Gilet – L",
  },
  {
    name: "Jesper Jensen",
    clothing: "Sailor Jacket – L; Collared Shirt – M; Navy Regatta – L",
  },
];

const SIZE_TOKEN =
  /^(2XL|3XL|XXL|XS|S|M|L|XL|X|XL\/L)(?=\s|$)/i;

function slugId(prefix: string, value: string) {
  return `${prefix}_${value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40)}`;
}

function parseLine(segment: string, index: number): IssuedKitLine | null {
  const raw = segment.trim();
  if (!raw) return null;
  if (/no items recorded|awaiting confirmation/i.test(raw)) return null;

  const noteMatch = raw.match(/\(([^)]+)\)\s*$/);
  const note = noteMatch?.[1]?.trim() ?? "";
  const withoutNote = (noteMatch ? raw.slice(0, noteMatch.index) : raw).trim();

  const parts = withoutNote.split(/\s*[–—]\s*/);
  const item = (parts[0] ?? withoutNote).trim();
  const rest = parts.slice(1).join(" – ").trim();

  let quantity = 1;
  let size = "";
  let colour = "";

  const qtyMatch = rest.match(/^(\d+)\s*[×x]\s*(.+)$/i);
  const body = qtyMatch ? qtyMatch[2].trim() : rest;
  if (qtyMatch) quantity = Math.max(1, Number(qtyMatch[1]) || 1);

  const sizeMatch = body.match(SIZE_TOKEN);
  if (sizeMatch) {
    size = sizeMatch[1].toUpperCase() === "2XL" ? "XXL" : sizeMatch[1];
    colour = body.slice(sizeMatch[0].length).trim();
  } else if (body) {
    colour = body;
  }

  return {
    id: `line_${index}_${slugId("i", item)}`,
    item,
    size,
    quantity,
    colour,
    note,
  };
}

function yearForLine(line: IssuedKitLine, defaultYear: number) {
  const note = line.note.toLowerCase();
  if (
    note.includes("january") ||
    note.includes("february") ||
    note.includes("march") ||
    note.includes("april") ||
    note.includes("may") ||
    note.includes("june") ||
    note.includes("july") ||
    note.includes("august") ||
    note.includes("september") ||
    note.includes("october") ||
    note.includes("november") ||
    note.includes("december")
  ) {
    return 2026;
  }
  return defaultYear;
}

/** Build editable issued-kit people from the original clothing list. */
export function buildIssuedKitSeed(now = new Date().toISOString()): IssuedKitPerson[] {
  const people: IssuedKitPerson[] = [];

  for (const record of LEGACY_RECORDS) {
    const segments = record.clothing.split(";").map((s) => s.trim());
    const parsed = segments
      .map((segment, index) => parseLine(segment, index))
      .filter((line): line is IssuedKitLine => Boolean(line));

    const byYear = new Map<number, IssuedKitLine[]>();
    if (parsed.length === 0) {
      byYear.set(2025, []);
    } else {
      for (const line of parsed) {
        const year = yearForLine(line, 2025);
        const list = byYear.get(year) ?? [];
        list.push(line);
        byYear.set(year, list);
      }
    }

    for (const [year, lines] of byYear) {
      people.push({
        id: slugId(`iss_${year}`, record.name),
        name: record.name,
        year,
        lines,
        source: "original",
        merch_order_id: null,
        created_at: now,
        updated_at: now,
      });
    }
  }

  return people.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return a.name.localeCompare(b.name);
  });
}

/** @deprecated Use buildIssuedKitSeed — kept for any leftover imports. */
export type PreviousClothingRecord = LegacyClothingRecord;
export const PREVIOUS_CLOTHING_ORDERS = LEGACY_RECORDS;
