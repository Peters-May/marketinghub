import { describe, expect, it } from "vitest";
import { buildEml, insertReleaseBlock, pitchEmlFiles, pitchExportContacts } from "@/lib/pr/pitch-eml";
import type { Contact } from "@/lib/types";

function person(partial: Partial<Contact> & Pick<Contact, "id" | "name" | "email">): Contact {
  return {
    kind: "person",
    organisation: "",
    role: "",
    phone: "",
    website: "",
    services: "",
    tags: ["Press"],
    notes: "",
    user_id: null,
    is_press: true,
    beat: "",
    outlet: "",
    country: "",
    preferred_topics: "",
    last_contacted_at: null,
    marketing_consent: null,
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

describe("pitch export", () => {
  it("writes a separate greeting for each recipient", () => {
    const files = pitchEmlFiles({
      title: "Yard opens",
      subject: "For {{first_name}}",
      body: "{{greeting}}, a note for {{outlet}}.",
      fromName: "Peters & May Marketing",
      fromEmail: "marketing@petersandmay.com",
      recipients: [
        person({
          id: "a",
          name: "Ada Lovelace",
          email: "ada@example.com",
          outlet: "Boat International",
        }),
        person({
          id: "b",
          name: "Grace Hopper",
          email: "grace@example.com",
          outlet: "TradeWinds",
        }),
      ],
    });

    expect(files).toHaveLength(2);
    expect(files[0]?.eml).toContain("Dear Ada");
    expect(files[0]?.eml).toContain("Boat International");
    expect(files[0]?.eml).not.toContain("Grace");
    expect(files[0]?.eml).toContain("To: Ada Lovelace <ada@example.com>");
    expect(files[0]?.eml).not.toContain("Bcc:");
    expect(files[1]?.eml).toContain("Dear Grace");
    expect(files[1]?.eml).not.toContain("Ada");
  });

  it("drops suppressed addresses", () => {
    const kept = pitchExportContacts(
      [
        person({ id: "a", name: "Ada Lovelace", email: "ada@example.com" }),
        person({ id: "b", name: "Grace Hopper", email: "grace@example.com" }),
        person({ id: "c", name: "No Address", email: "" }),
      ],
      ["grace@example.com"]
    );
    expect(kept.map((contact) => contact.id)).toEqual(["a"]);
  });

  it("splits a long subject into encoded-words without breaking the line mid-word", () => {
    const eml = buildEml({
      from: "Peters & May\r\nBcc: leak@example.com <marketing@petersandmay.com>",
      to: ["Ada Lovelace\r\nBcc: leak@example.com <ada@example.com>"],
      subject: `Peters & May — ${"yacht transport ".repeat(8)}`,
      body: "Hello",
    });
    const header = eml.split("\r\n\r\n")[0] ?? "";
    const words = header.match(/=\?UTF-8\?Q\?[^?\r\n]*\?=/g) ?? [];
    expect(words.length).toBeGreaterThan(1);
    for (const word of words) expect(word.length).toBeLessThanOrEqual(75);
    expect(header.split("\r\n").some((line) => /^Bcc:/i.test(line))).toBe(false);
    expect(eml).not.toContain("leak@example.com");
    expect(eml).toContain("To: Ada Lovelace");
  });

  it("links the full release, not only the newsroom index", () => {
    const body = insertReleaseBlock(
      "A note",
      { id: "cnt_yard", title: "Yard opens", caption: "The yard is open." },
      "https://hub.example.com"
    );
    expect(body).toContain("https://hub.example.com/newsroom/cnt_yard");
  });
});
