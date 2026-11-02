import { describe, expect, it } from "vitest";
import {
  categoryFromShareKey,
  categoryShareKey,
  TEMPLATES_CATEGORY,
} from "@/lib/supabase/media-list";

describe("category share keys", () => {
  it("stores Templates under a reserved key", () => {
    expect(categoryShareKey("Templates")).toBe("category:Templates");
    expect(categoryFromShareKey("category:Templates")).toBe(TEMPLATES_CATEGORY);
    expect(categoryFromShareKey("category:templates")).toBe(TEMPLATES_CATEGORY);
  });

  it("does not treat other categories or gallery folders as a category share", () => {
    expect(categoryFromShareKey("category:Documents")).toBeNull();
    expect(categoryFromShareKey("Headshots")).toBeNull();
    expect(categoryFromShareKey("")).toBeNull();
  });
});
