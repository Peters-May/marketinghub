import { describe, expect, it } from "vitest";
import { isAllowedUpload } from "@/lib/upload/allowed-types";

describe("isAllowedUpload", () => {
  it("rejects HTML and SVG even when the other half looks safe", () => {
    expect(isAllowedUpload("notes.html", "image/png")).toBe(false);
    expect(isAllowedUpload("logo.png", "image/svg+xml")).toBe(false);
    expect(isAllowedUpload("logo.svg", "image/png")).toBe(false);
    expect(isAllowedUpload("page.png", "text/html")).toBe(false);
  });

  it("allows a matching image or document", () => {
    expect(isAllowedUpload("yard.png", "image/png")).toBe(true);
    expect(isAllowedUpload("notes.pdf", "")).toBe(true);
    expect(isAllowedUpload("pasted", "image/png")).toBe(true);
  });
});
