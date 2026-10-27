import { describe, expect, it } from "vitest";
import { pitchEmlFiles, pitchExportContacts } from "@/lib/pr/pitch-eml";
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
    expect(files[0]?.eml).toContain("To: ada@example.com");
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
});
