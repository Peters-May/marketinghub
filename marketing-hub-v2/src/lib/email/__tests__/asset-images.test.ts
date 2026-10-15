import { describe, expect, it } from "vitest";
import { groupAssetImages, imagesFromMediaItems } from "@/lib/email/asset-images";

describe("imagesFromMediaItems", () => {
  it("keeps raster files and Drive images from the gallery", () => {
    const images = imagesFromMediaItems([
      {
        id: "logo",
        name: "Wordmark",
        category: "Logos",
        files: [{ url: "https://cdn.example.com/logo.png", name: "logo.png", type: "image/png" }],
      },
      {
        id: "yacht",
        name: "Yacht",
        category: "Gallery",
        document_link: "https://drive.google.com/file/d/abc123/view",
      },
      {
        id: "deck",
        name: "Rates",
        category: "Documents",
        document_link: "https://drive.google.com/file/d/pdf999/view",
        files: [{ url: "https://cdn.example.com/rates.pdf", name: "rates.pdf", type: "application/pdf" }],
      },
    ]);

    expect(images.map((image) => image.url)).toEqual([
      "https://cdn.example.com/logo.png",
      "https://drive.google.com/thumbnail?id=abc123&sz=w800",
    ]);
  });

  it("uses a direct cover image when the file list is empty", () => {
    const images = imagesFromMediaItems([
      {
        id: "cover",
        name: "Harbour",
        category: "Gallery",
        cover_url: "https://cdn.example.com/harbour.webp",
      },
    ]);
    expect(images).toEqual([
      {
        id: "cover-cover",
        name: "Harbour",
        url: "https://cdn.example.com/harbour.webp",
        folder: "Gallery",
      },
    ]);
  });

  it("keeps gallery subfolders separate from other libraries", () => {
    const images = imagesFromMediaItems([
      {
        id: "a",
        name: "Dock",
        category: "Gallery",
        subfolder: "Ports",
        files: [{ url: "https://cdn.example.com/dock.jpg", name: "dock.jpg", type: "image/jpeg" }],
      },
      {
        id: "b",
        name: "Wordmark",
        category: "Logos",
        files: [{ url: "https://cdn.example.com/mark.png", name: "mark.png", type: "image/png" }],
      },
    ]);

    expect(groupAssetImages(images).map((folder) => folder.name)).toEqual([
      "Gallery / Ports",
      "Logos",
    ]);
  });
});
