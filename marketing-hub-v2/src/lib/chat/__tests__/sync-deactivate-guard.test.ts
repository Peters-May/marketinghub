import { describe, expect, it } from "vitest";
import {
  SITE_KB_DEACTIVATE_MIN_DISCOVERED,
  shouldSkipSiteKbDeactivation,
} from "@/lib/chat/sync-site-knowledge";

describe("shouldSkipSiteKbDeactivation", () => {
  it("skips when discovery is empty", () => {
    const result = shouldSkipSiteKbDeactivation({
      discoveredCount: 0,
      activeCount: 200,
      staleCount: 200,
    });
    expect(result.skip).toBe(true);
  });

  it("skips when discovery is below the safety minimum", () => {
    const result = shouldSkipSiteKbDeactivation({
      discoveredCount: SITE_KB_DEACTIVATE_MIN_DISCOVERED - 1,
      activeCount: 200,
      staleCount: 5,
    });
    expect(result.skip).toBe(true);
  });

  it("skips when too large a fraction would be deactivated", () => {
    const result = shouldSkipSiteKbDeactivation({
      discoveredCount: 100,
      activeCount: 200,
      staleCount: 100,
    });
    expect(result.skip).toBe(true);
  });

  it("allows a modest cleanup when discovery looks healthy", () => {
    const result = shouldSkipSiteKbDeactivation({
      discoveredCount: 180,
      activeCount: 200,
      staleCount: 20,
    });
    expect(result.skip).toBe(false);
  });
});
