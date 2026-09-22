import { describe, expect, it } from "vitest";
import {
  canAccessEnquiries,
  hubRoleToSessionRole,
  isSeoAllowedAppPath,
  isStaffSession,
  normalizeHubAccessRole,
} from "@/lib/auth/roles";
import { navForView } from "@/lib/nav";

describe("SEO role", () => {
  it("normalises and maps hub seo to the seo session role", () => {
    expect(normalizeHubAccessRole("seo")).toBe("seo");
    expect(hubRoleToSessionRole("seo")).toBe("seo");
  });

  it("does not treat SEO as full staff", () => {
    expect(isStaffSession("seo")).toBe(false);
    expect(canAccessEnquiries("seo")).toBe(true);
  });

  it("only allows Enquiries and My details app paths", () => {
    expect(isSeoAllowedAppPath("/app/enquiries")).toBe(true);
    expect(isSeoAllowedAppPath("/app/enquiries/export")).toBe(true);
    expect(isSeoAllowedAppPath("/app/me")).toBe(true);
    expect(isSeoAllowedAppPath("/app")).toBe(false);
    expect(isSeoAllowedAppPath("/app/events")).toBe(false);
    expect(isSeoAllowedAppPath("/app/contacts")).toBe(false);
  });

  it("shows only Enquiries in SEO nav", () => {
    const hrefs = navForView("seo").map((item) => item.href);
    expect(hrefs).toEqual(["/app/enquiries"]);
  });
});
