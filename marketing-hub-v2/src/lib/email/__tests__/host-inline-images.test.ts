import { describe, expect, it } from "vitest";
import { hostInlineEmailImages } from "@/lib/email/host-inline-images";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

describe("host inline email images", () => {
  it("replaces an embedded image with the hosted address", async () => {
    const html = `<img src="${PNG}" alt="Logo"><img src="${PNG}" alt="Again">`;
    const hosted = await hostInlineEmailImages(html, async () => "https://cdn.example/logo.png");
    expect(hosted).not.toContain("data:image");
    expect(hosted).toContain('src="https://cdn.example/logo.png"');
  });

  it("leaves the message alone when hosting fails", async () => {
    const html = `<img src="${PNG}" alt="Logo">`;
    const hosted = await hostInlineEmailImages(html, async () => null);
    expect(hosted).toBe(html);
  });
});