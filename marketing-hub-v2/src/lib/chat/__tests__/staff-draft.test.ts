import { describe, expect, it } from "vitest";
import { STAFF_REPLY_TEMPLATES } from "@/lib/chat/staff-templates";

describe("STAFF_REPLY_TEMPLATES", () => {
  it("provides editable operator chips with body copy", () => {
    expect(STAFF_REPLY_TEMPLATES.length).toBeGreaterThanOrEqual(4);
    for (const tpl of STAFF_REPLY_TEMPLATES) {
      expect(tpl.id).toBeTruthy();
      expect(tpl.label).toBeTruthy();
      expect(tpl.body.length).toBeGreaterThan(20);
      expect(tpl.body).not.toMatch(/!/);
    }
  });
});
