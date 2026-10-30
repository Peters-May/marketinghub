import { describe, expect, it } from "vitest";
import { isAllowedUpload, uploadContentType } from "@/lib/upload/allowed-types";

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

  it("allows M4V and stores it as MP4", () => {
    expect(isAllowedUpload("arrival.m4v", "video/mp4")).toBe(true);
    expect(isAllowedUpload("arrival.m4v", "video/x-m4v")).toBe(true);
    expect(isAllowedUpload("arrival.m4v", "")).toBe(true);
    expect(isAllowedUpload("arrival.m4v", "application/octet-stream")).toBe(true);
    expect(isAllowedUpload("clip.exe", "video/x-m4v")).toBe(false);
    expect(uploadContentType("arrival.m4v", "video/x-m4v")).toBe("video/mp4");
    expect(uploadContentType("arrival.mp4", "video/mp4")).toBe("video/mp4");
  });

  it("allows Outlook email templates", () => {
    expect(
      isAllowedUpload(
        "Booking Confirmation and Next Steps V6.oft",
        "application/vnd.ms-outlook"
      )
    ).toBe(true);
    expect(
      isAllowedUpload(
        "Booking Confirmation and Next Steps V6.oft",
        "application/octet-stream"
      )
    ).toBe(true);
    expect(isAllowedUpload("Booking Confirmation.oft", "")).toBe(true);
    expect(uploadContentType("Booking Confirmation.oft", "")).toBe(
      "application/vnd.ms-outlook"
    );
  });
});
