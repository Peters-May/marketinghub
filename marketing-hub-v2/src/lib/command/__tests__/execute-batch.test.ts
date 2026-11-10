import { describe, expect, it } from "vitest";
import { formatBatchSaveMessage } from "@/lib/command/execute";

describe("formatBatchSaveMessage", () => {
  it("reports success only when nothing failed", () => {
    expect(
      formatBatchSaveMessage({ savedCount: 2, failedMessages: [] })
    ).toBe("Saved 2 records.");
  });

  it("includes the failure reason so Confirm explains what went wrong", () => {
    expect(
      formatBatchSaveMessage({
        savedCount: 1,
        failedMessages: ['No event matches “Prowly Press Service”.'],
      })
    ).toBe(
      'Saved 1 record. 1 could not be saved: No event matches “Prowly Press Service”.'
    );
  });

  it("dedupes repeated failure reasons and numbers distinct ones", () => {
    expect(
      formatBatchSaveMessage({
        savedCount: 1,
        failedMessages: [
          'No event matches “Prowly Press Service”.',
          'No event matches “Prowly Press Service”.',
          'No event matches “Annapolis 2026”.',
        ],
      })
    ).toBe(
      'Saved 1 record. 3 could not be saved: 1. No event matches “Prowly Press Service”. 2. No event matches “Annapolis 2026”.'
    );
  });
});
