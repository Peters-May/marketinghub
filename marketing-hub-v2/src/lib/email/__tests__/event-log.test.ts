import { describe, expect, it } from "vitest";
import { readAllPages } from "@/lib/email/event-log";

function table(total: number) {
  const rows = Array.from({ length: total }, (_, i) => ({ email: `p${i}@x.com` }));
  const calls: Array<[number, number]> = [];
  const fetchPage = async (from: number, to: number) => {
    calls.push([from, to]);
    // Mimic PostgREST: never more than 1,000 rows in one response.
    const end = Math.min(to + 1, from + 1000);
    return { data: rows.slice(from, end), error: null };
  };
  return { fetchPage, calls };
}

describe("readAllPages", () => {
  it("reads past the 1,000-row response cap", async () => {
    const { fetchPage, calls } = table(2500);
    const rows = await readAllPages(fetchPage);
    expect(rows).toHaveLength(2500);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("stops after an exactly full last page", async () => {
    const { fetchPage, calls } = table(2000);
    expect(await readAllPages(fetchPage)).toHaveLength(2000);
    expect(calls).toHaveLength(3);
  });

  it("honours a row cap", async () => {
    const { fetchPage } = table(5000);
    expect(await readAllPages(fetchPage, 1500)).toHaveLength(1500);
  });

  it("throws instead of returning a partial list", async () => {
    let page = 0;
    const fetchPage = async () => {
      page += 1;
      if (page === 2) return { data: null, error: { message: "timeout" } };
      return { data: Array.from({ length: 1000 }, () => ({ email: "a@x.com" })), error: null };
    };
    await expect(readAllPages(fetchPage)).rejects.toThrow("timeout");
  });
});
