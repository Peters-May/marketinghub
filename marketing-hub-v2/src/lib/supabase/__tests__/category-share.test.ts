import { describe, expect, it } from "vitest";
import {
  categoryFromShareKey,
  categoryShareKey,
  shareItemVisibleTo,
  TEMPLATES_CATEGORY,
} from "@/lib/supabase/media-list";

function item(visibility: "public" | "internal" | "admin") {
  return {
    category: "Documents",
    subfolder_visibility: "internal" as const,
    visibility,
  };
}

describe("category share keys", () => {
  it("stores a library category under a reserved key", () => {
    expect(categoryShareKey("Templates")).toBe("category:Templates");
    expect(categoryFromShareKey("category:Templates")).toBe(TEMPLATES_CATEGORY);
    expect(categoryFromShareKey("category:documents")).toBe("Documents");
    expect(categoryFromShareKey("category:logos")).toBe("Logos");
  });

  it("does not treat gallery folders as a category share", () => {
    expect(categoryFromShareKey("Headshots")).toBeNull();
    expect(categoryFromShareKey("category:")).toBeNull();
    expect(categoryFromShareKey("")).toBeNull();
  });
});

describe("share item visibility", () => {
  it("shows public files to anyone and keeps internal files for staff", () => {
    const guest = { staff: false, admin: false };
    const staff = { staff: true, admin: false };
    expect(shareItemVisibleTo(item("public"), guest)).toBe(true);
    expect(shareItemVisibleTo(item("internal"), guest)).toBe(false);
    expect(shareItemVisibleTo(item("internal"), staff)).toBe(true);
    expect(shareItemVisibleTo(item("admin"), staff)).toBe(false);
    expect(shareItemVisibleTo(item("admin"), { staff: true, admin: true })).toBe(
      true
    );
  });
});
