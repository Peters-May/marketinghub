import { describe, expect, it } from "vitest";
import {
  buildRecipientIndex,
  countEmailRecipients,
  matchEmailRecipients,
} from "@/lib/email/recipients";
import type { Contact, EmailAudience, MediaList } from "@/lib/types";

function contact(patch: Partial<Contact> & Pick<Contact, "id" | "email">): Contact {
  return {
    kind: "person",
    name: patch.email,
    organisation: "",
    role: "",
    phone: "",
    website: "",
    services: "",
    tags: [],
    notes: "",
    user_id: null,
    is_press: false,
    beat: "",
    outlet: "",
    country: "",
    preferred_topics: "",
    last_contacted_at: null,
    marketing_consent: true,
    created_at: "",
    updated_at: "",
    ...patch,
  };
}

function audience(
  patch: Partial<EmailAudience> & Pick<EmailAudience, "id" | "name">
): EmailAudience {
  return {
    description: "",
    list_ids: [],
    contact_ids: [],
    filter: { tags: [], country: "" },
    exclude_unsubscribed: true,
    created_at: "",
    updated_at: "",
    ...patch,
  };
}

function list(id: string, contact_ids: string[]): MediaList {
  return {
    id,
    name: id,
    description: "",
    contact_ids,
    list_kind: "marketing",
    source: "",
    created_at: "",
    updated_at: "",
  };
}

describe("matchEmailRecipients", () => {
  const contacts = [
    contact({ id: "ok", email: "ok@example.com", country: "United Kingdom", tags: ["yacht"] }),
    contact({ id: "no-consent", email: "no@example.com", marketing_consent: false }),
    contact({ id: "suppressed", email: "gone@example.com" }),
    contact({ id: "blank", email: "" }),
    contact({
      id: "opt-out",
      email: "schedules@example.com",
      email_topic_opt_outs: ["sailing_schedules"],
    }),
    contact({ id: "other-country", email: "us@example.com", country: "United States" }),
  ];
  const store = {
    contacts,
    media_lists: [list("buyers", ["ok", "no-consent", "suppressed", "blank", "missing"])],
    email_audiences: [
      audience({
        id: "news",
        name: "Newsletter audience",
        list_ids: ["buyers"],
        filter: { tags: ["yacht"], country: "United Kingdom" },
      }),
      audience({
        id: "schedules",
        name: "Sailing schedule updates",
        contact_ids: ["ok", "opt-out"],
      }),
      audience({ id: "blocked", name: "Blocked", contact_ids: ["suppressed"] }),
    ],
    email_suppressions: [{ email: "gone@example.com" }],
  };
  const index = buildRecipientIndex(store);

  it("keeps consented matching contacts and drops the rest", () => {
    const rows = matchEmailRecipients(index, { audienceId: "news" });
    expect(rows.map((row) => row.id)).toEqual(["ok"]);
    expect(countEmailRecipients(index, { audienceId: "news" })).toBe(1);
  });

  it("drops topic opt-outs and excluded audience emails", () => {
    expect(matchEmailRecipients(index, { audienceId: "schedules" }).map((row) => row.id)).toEqual([
      "ok",
    ]);
    expect(
      matchEmailRecipients(index, {
        audienceId: "schedules",
        excludeAudienceId: "blocked",
        recipientIds: ["suppressed"],
      }).map((row) => row.id)
    ).toEqual(["ok"]);
  });

  it("includes press contacts on a pitch without marketing consent", () => {
    const journalist = contact({
      id: "journo",
      email: "desk@example.com",
      marketing_consent: null,
      is_press: true,
    });
    const buyer = contact({
      id: "buyer",
      email: "buyer@example.com",
      marketing_consent: null,
    });
    const blocked = contact({
      id: "blocked-press",
      email: "gone-press@example.com",
      marketing_consent: null,
      is_press: true,
    });
    const pitchIndex = buildRecipientIndex({
      contacts: [journalist, buyer, blocked],
      media_lists: [
        {
          ...list("yacht-press", ["journo", "blocked-press"]),
          list_kind: "press",
        },
        list("customers", ["buyer"]),
      ],
      email_audiences: [
        audience({
          id: "press-desk",
          name: "Yacht press",
          list_ids: ["yacht-press"],
        }),
      ],
      email_suppressions: [{ email: "gone-press@example.com" }],
    });

    expect(
      matchEmailRecipients(pitchIndex, {
        audienceId: "press-desk",
        purpose: "pitch",
      }).map((row) => row.id)
    ).toEqual(["journo"]);
    expect(
      matchEmailRecipients(pitchIndex, {
        listIds: ["customers"],
        purpose: "pitch",
      })
    ).toEqual([]);
    expect(
      matchEmailRecipients(pitchIndex, { audienceId: "press-desk" })
    ).toEqual([]);
  });
});
