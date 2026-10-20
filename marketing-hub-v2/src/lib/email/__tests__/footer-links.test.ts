import { describe, expect, it } from "vitest";
import { defaultEmailStyles } from "@/lib/email/design/document";
import {
  footerLinkPreviewParts,
  resolveFooterLinkSettings,
} from "@/lib/email/footer-links";

describe("resolveFooterLinkSettings", () => {
  it("uses email-level toggles and labels", () => {
    const settings = resolveFooterLinkSettings({
      ...defaultEmailStyles(),
      showUnsubscribeLink: true,
      showPreferencesLink: false,
      unsubscribeLabel: "Leave list",
    });
    expect(settings.showUnsubscribe).toBe(true);
    expect(settings.showPreferences).toBe(false);
    expect(settings.unsubscribeLabel).toBe("Leave list");
    expect(footerLinkPreviewParts(settings)).toEqual(["Leave list"]);
  });
});
