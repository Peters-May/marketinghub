import { describe, expect, it } from "vitest";
import {
  addUtcDays,
  aiKeyHealth,
  daysUntilDate,
  nextAiKeyNotice,
} from "@/lib/ai/ai-key-status";

describe("AI key expiry", () => {
  it("counts calendar days until the expiry date", () => {
    expect(daysUntilDate("2027-01-20", "2026-10-22")).toBe(90);
    expect(addUtcDays("2026-10-22", 90)).toBe("2027-01-20");
  });

  it("warns inside two weeks and treats the expiry date as due", () => {
    expect(aiKeyHealth(90, true)).toBe("ok");
    expect(aiKeyHealth(14, true)).toBe("soon");
    expect(aiKeyHealth(7, true)).toBe("urgent");
    expect(aiKeyHealth(0, true)).toBe("expired");
    expect(aiKeyHealth(null, false)).toBe("missing");
  });

  it("sends the tightest reminder that has not already gone out", () => {
    expect(nextAiKeyNotice(90, [])).toBeNull();
    expect(nextAiKeyNotice(14, [])).toBe("14");
    expect(nextAiKeyNotice(5, ["14"])).toBe("7");
    expect(nextAiKeyNotice(0, ["14", "7", "1"])).toBe("0");
    expect(nextAiKeyNotice(-2, ["14", "7", "1", "0"])).toBeNull();
  });
});
