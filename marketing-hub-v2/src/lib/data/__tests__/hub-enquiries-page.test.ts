import { describe, expect, it } from "vitest";
import { hubEnquirySourceWindow } from "@/lib/data/hub-enquiries";

describe("hubEnquirySourceWindow", () => {
  it("asks each table for enough newest rows to fill the merged page", () => {
    expect(hubEnquirySourceWindow(0, 100)).toEqual({
      sourceLimit: 100,
      from: 0,
      to: 100,
    });
    expect(hubEnquirySourceWindow(100, 100)).toEqual({
      sourceLimit: 200,
      from: 100,
      to: 200,
    });
  });

  it("does not ask for more than the fetch cap", () => {
    expect(hubEnquirySourceWindow(19_950, 100).sourceLimit).toBe(20_000);
  });
});
