import { describe, expect, it } from "vitest";
import {
  resolveChatGuidance,
  suggestOfficeFromEnquiryText,
  DEFAULT_ENQUIRY_CHAT_GUIDANCE,
} from "@/lib/chat/enquiry-guidance";

describe("resolveChatGuidance", () => {
  it("falls back for empty or legacy KB-only seed", () => {
    expect(resolveChatGuidance("")).toBe(DEFAULT_ENQUIRY_CHAT_GUIDANCE);
    expect(
      resolveChatGuidance(
        "Answer only from the knowledge base. Use British English."
      )
    ).toBe(DEFAULT_ENQUIRY_CHAT_GUIDANCE);
  });

  it("keeps custom saved guidance", () => {
    expect(resolveChatGuidance("Custom yacht-first rules.")).toBe(
      "Custom yacht-first rules."
    );
  });
});

describe("suggestOfficeFromEnquiryText", () => {
  it("maps origin hints", () => {
    expect(suggestOfficeFromEnquiryText("Yacht in Genoa to Nassau")).toBe(
      "Italy"
    );
    expect(suggestOfficeFromEnquiryText("Boat in Safaga, Egypt")).toBe(
      "Dubai"
    );
    expect(suggestOfficeFromEnquiryText("From Miami Florida")).toBe("Florida");
    expect(suggestOfficeFromEnquiryText("Sydney to Auckland")).toBe("Asia");
  });
});
