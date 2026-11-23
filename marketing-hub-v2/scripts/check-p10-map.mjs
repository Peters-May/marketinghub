import rows from "../src/lib/budget/p10-marketing-2026.json" with { type: "json" };

function draftIdForMarketingCode(code) {
  const compact = code.trim().toUpperCase().replace(/\s+/g, "");
  if (!compact) return null;
  if (compact === "MP3") return null;
  if (compact === "MS1" || compact === "MSI") return "ms1";
  if (compact === "MS2") return "ms2";
  if (compact === "MP1") return "video";
  if (compact === "MP2") return "mp2";
  if (compact === "MM") return "memberships";
  if (compact === "MC") return "mc";
  if (compact === "ME") return "me";
  if (compact.startsWith("MB") || compact === "M8") return "mbx";
  if (compact.startsWith("MTG")) return "mtg";
  if (compact.startsWith("MT") || compact === "MTL") return "mtx";
  if (compact.startsWith("INDEED")) return "mtg";
  if (compact.startsWith("TRAVEL")) return "mtx";
  if (compact === "OTHER") return "mtx";
  return null;
}

const unmapped = new Map();
let mapped = 0;
let sum = 0;
const byLine = {};
for (const row of rows) {
  const id = draftIdForMarketingCode(row.code);
  if (!id) {
    unmapped.set(row.code, (unmapped.get(row.code) || 0) + row.amount);
    continue;
  }
  mapped++;
  sum += row.amount;
  byLine[id] = (byLine[id] || 0) + row.amount;
}

console.log("json rows", rows.length, "mapped", mapped);
console.log("mapped sum", Math.round(sum * 100) / 100);
console.log(
  Object.fromEntries(
    Object.entries(byLine).map(([k, v]) => [k, Math.round(v * 100) / 100])
  )
);
console.log(
  "unmapped",
  Object.fromEntries(
    [...unmapped.entries()].map(([k, v]) => [k, Math.round(v * 100) / 100])
  )
);
