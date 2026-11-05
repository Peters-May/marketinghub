import { describe, expect, it } from "vitest";
import type { MediaListItem } from "@/lib/supabase/media-list";
import {
  classifySharePresentation,
  shouldDirectDownloadShare,
  shouldDirectOpenShareLink,
} from "@/lib/media/share-presentation";

function item(
  partial: Partial<MediaListItem> & Pick<MediaListItem, "id" | "name">
): MediaListItem {
  return {
    public_title: "",
    display_name: partial.name,
    category: "Documents",
    subfolder: "",
    subfolder_visibility: "public",
    visibility: "public",
    division: "All",
    status: "",
    owned_by: "",
    notes: "",
    document_url: "",
    document_link: "",
    files: [],
    cover_url: null,
    created_at: null,
    updated_at: null,
    ...partial,
  };
}

describe("classifySharePresentation", () => {
  it("treats a lone attached file as a direct download", () => {
    const presentation = classifySharePresentation([
      item({
        id: "1",
        name: "Brand guide",
        files: [
          {
            url: "https://cdn.example/guide.pdf",
            name: "guide.pdf",
            type: "application/pdf",
            size: 10,
          },
        ],
      }),
    ]);
    expect(shouldDirectDownloadShare(presentation)?.url).toBe(
      "https://cdn.example/guide.pdf"
    );
    expect(presentation.heroImages).toHaveLength(0);
  });

  it("uses preview screenshots as hero when a file or link is also present", () => {
    const presentation = classifySharePresentation([
      item({
        id: "2",
        name: "Template pack",
        document_link: "https://example.com/pack",
        files: [
          {
            url: "https://cdn.example/pack.zip",
            name: "pack.zip",
            type: "application/zip",
            size: 20,
          },
          {
            url: "https://cdn.example/preview.png",
            name: "preview.png",
            type: "image/png",
            size: 5,
          },
        ],
      }),
    ]);
    expect(presentation.files).toHaveLength(1);
    expect(presentation.links).toHaveLength(1);
    expect(presentation.heroImages).toHaveLength(1);
    expect(presentation.galleryImages).toHaveLength(0);
    expect(shouldDirectDownloadShare(presentation)).toBeNull();
  });

  it("keeps standalone photos as gallery content", () => {
    const presentation = classifySharePresentation([
      item({
        id: "3",
        name: "Headshot",
        files: [
          {
            url: "https://cdn.example/a.jpg",
            name: "a.jpg",
            type: "image/jpeg",
            size: 3,
          },
          {
            url: "https://cdn.example/b.jpg",
            name: "b.jpg",
            type: "image/jpeg",
            size: 4,
          },
        ],
      }),
    ]);
    expect(presentation.galleryImages).toHaveLength(2);
    expect(presentation.files).toHaveLength(0);
    expect(shouldDirectDownloadShare(presentation)).toBeNull();
  });

  it("opens a lone link directly when there is no preview", () => {
    const presentation = classifySharePresentation([
      item({
        id: "4",
        name: "Drive folder",
        document_link: "https://example.com/folder",
      }),
    ]);
    expect(shouldDirectOpenShareLink(presentation)?.url).toBe(
      "https://example.com/folder"
    );
  });
});
