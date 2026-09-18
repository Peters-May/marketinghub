import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const p = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/lib/store/seed.ts"
);
let s = fs.readFileSync(p, "utf8");

s = s.replace(
  /(last_contacted_at: null,)\r?\n(\s*)(created_at: now,)/g,
  (m, a, sp, c) => {
    if (m.includes("marketing_consent")) return m;
    return `${a}\n${sp}marketing_consent: null,\n${sp}${c}`;
  }
);

if (!s.includes('list_kind: "press"')) {
  s = s.replace(
    `description: "UK yacht and leisure press",
        contact_ids: ["ctc_seed_press_demo"],`,
    `description: "UK yacht and leisure press",
        list_kind: "press",
        source: "seed",
        contact_ids: ["ctc_seed_press_demo"],`
  );
}

if (!s.includes("ml_seed_marketing")) {
  s = s.replace(
    `pr_pitches: [],`,
    `pr_pitches: [],
    // marketing list placeholder filled below`
  );
  // insert marketing list after yacht list closing
  s = s.replace(
    `contact_ids: ["ctc_seed_press_demo"],
        created_at: now,
        updated_at: now,
      },
    ],
    pr_pitches: [],`,
    `contact_ids: ["ctc_seed_press_demo"],
        created_at: now,
        updated_at: now,
      },
      {
        id: "ml_seed_marketing",
        name: "Marketing — newsletter",
        description: "Marketing email list (HubSpot)",
        list_kind: "marketing",
        source: "seed",
        contact_ids: [],
        created_at: now,
        updated_at: now,
      },
    ],
    pr_pitches: [],`
  );
}

fs.writeFileSync(p, s);
console.log(
  "consent",
  (s.match(/marketing_consent: null/g) || []).length,
  "list_kind",
  (s.match(/list_kind:/g) || []).length
);
