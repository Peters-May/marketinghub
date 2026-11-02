import { describe, expect, it } from "vitest";
import {
  canAccessWebsiteChat,
  websiteChatInMemberNav,
} from "@/lib/auth/chat-access";
import { navForView } from "@/lib/nav";

describe("website chat access", () => {
  it("lets admins and SEO in, and members only when granted", () => {
    expect(canAccessWebsiteChat({ role: "admin" })).toBe(true);
    expect(canAccessWebsiteChat({ role: "seo" })).toBe(true);
    expect(canAccessWebsiteChat({ role: "staff" })).toBe(false);
    expect(
      canAccessWebsiteChat({ role: "staff", websiteChat: true })
    ).toBe(true);
    expect(canAccessWebsiteChat({ role: "media_guest", websiteChat: true })).toBe(
      false
    );
    expect(canAccessWebsiteChat(null)).toBe(false);
  });

  it("hides Website chat from the member nav unless that person was granted it", () => {
    expect(websiteChatInMemberNav({ role: "admin", websiteChat: true })).toBe(
      false
    );
    expect(websiteChatInMemberNav({ role: "staff" })).toBe(false);
    expect(websiteChatInMemberNav({ role: "staff", websiteChat: true })).toBe(
      true
    );

    const memberHrefs = navForView("member").map((item) => item.href);
    expect(memberHrefs).not.toContain("/app/chat");
    expect(
      navForView("member", { chatInMemberNav: true }).map((item) => item.href)
    ).toContain("/app/chat");
    expect(navForView("admin").map((item) => item.href)).toContain("/app/chat");
    expect(navForView("seo").map((item) => item.href)).toEqual([
      "/app/enquiries",
      "/app/chat",
    ]);
  });
});
