import { describe, expect, it } from "vitest";
import { galleryFilePath, safeGalleryFilename } from "@/lib/email/gallery";

describe("email gallery filenames", () => {
  it("accepts a plain image name and rejects paths", () => {
    expect(safeGalleryFilename("photo.png")).toBe("photo.png");
    expect(safeGalleryFilename("../photo.png")).toBeNull();
    expect(safeGalleryFilename("photo.svg")).toBeNull();
    expect(safeGalleryFilename("photo.pdf")).toBeNull();
  });

  it("keeps the file inside the gallery folder", () => {
    const file = galleryFilePath("photo.png");
    expect(file).toMatch(/photo\.png$/);
    expect(galleryFilePath("..\\photo.png")).toBeNull();
  });
});