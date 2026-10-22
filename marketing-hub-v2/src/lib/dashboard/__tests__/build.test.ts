import { describe, expect, it } from "vitest";
import { buildDashboard } from "@/lib/dashboard/build";
import { emptyAttendanceOpsFields } from "@/lib/events/attendance-checklist";
import { emptyPlannerFields } from "@/lib/events/planner";
import type { ContentItem, EventItem, HubTask } from "@/lib/types";

const now = new Date("2026-10-22T09:00:00.000Z");
const viewer = { id: "user-sophie", fullName: "Sophie Edgerley", isAdmin: true };

function task(partial: Partial<HubTask> & Pick<HubTask, "id" | "title">): HubTask {
  return {
    details: "",
    start_date: null,
    due_date: null,
    category: "",
    status: "todo",
    owner: "",
    related_type: "",
    related_id: null,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    ...partial,
  };
}

function content(
  partial: Partial<ContentItem> & Pick<ContentItem, "id" | "title">
): ContentItem {
  return {
    channel: [],
    content_type: "Editorial",
    owner: "",
    due_date: null,
    deadline_date: null,
    status: "draft",
    category: "",
    priority: "",
    website: "",
    caption: "",
    theme_id: null,
    planable_url: "",
    planable_post_id: "",
    planable_group_id: "",
    planable_page_ids: [],
    last_synced_at: null,
    sync_source: "",
    asset_url: "",
    notes: "",
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    ...partial,
  };
}

function event(partial: Partial<EventItem> & Pick<EventItem, "id" | "title">): EventItem {
  return {
    ...emptyPlannerFields(),
    ...emptyAttendanceOpsFields(),
    starts_at: "2026-11-20T10:00:00.000Z",
    ends_at: null,
    location: "Monaco",
    event_type: "Boat show",
    division: "Leisure",
    notes: "",
    link_url: "",
    created_by: null,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    ...partial,
  };
}

describe("buildDashboard", () => {
  it("lists assigned tasks before other work and does not repeat a linked content deadline", () => {
    const model = buildDashboard({
      now,
      viewer,
      scope: "mine",
      tasks: [
        task({
          id: "t1",
          title: "Finish the blog",
          owner: "Sophie Edgerley",
          owner_user_id: "user-sophie",
          due_date: "2026-10-20",
          related_type: "content",
          related_id: "c1",
        }),
        task({
          id: "t2",
          title: "Someone else's task",
          owner: "Alex",
          due_date: "2026-10-18",
        }),
      ],
      content: [
        content({
          id: "c1",
          title: "ARC blog",
          owner: "Sophie Edgerley",
          deadline_date: "2026-10-21",
          status: "draft",
        }),
        content({
          id: "c2",
          title: "Press note",
          owner: "Sophie",
          deadline_date: "2026-10-25",
          status: "review",
        }),
      ],
      events: [],
      attendance: [],
      awards: [],
      enquiries: [],
      emails: [],
      budget: null,
    });

    expect(model.actions.map((row) => row.title)).toEqual([
      "Finish the blog",
      "Press note",
    ]);
    expect(model.actions[0]?.tone).toBe("overdue");
    expect(model.actions.filter((row) => row.key === "content:c1")).toHaveLength(0);
  });

  it("shows preparation for events the viewer is attending, and org items only on everyone", () => {
    const shared = {
      now,
      viewer,
      tasks: [],
      content: [],
      events: [
        event({
          id: "e1",
          title: "FLIBS",
          pm_attending: true,
          accommodation_arranged: false,
        }),
      ],
      attendance: [
        {
          id: "a1",
          event_id: "e1",
          user_id: "user-sophie",
          user_name: "Sophie Edgerley",
          attendance_status: "attending" as const,
          created_at: "",
          updated_at: "",
        },
      ],
      awards: [],
      enquiries: [
        {
          id: "q1",
          customer_name: "Jane",
          needs_manual_review: true,
          status: "new" as const,
          updated_at: "2026-10-21T00:00:00.000Z",
        },
      ],
      emails: [
        {
          id: "m1",
          title: "October sailing update",
          status: "failed" as const,
          scheduled_at: null,
        },
      ],
      budget: null,
    };

    const mine = buildDashboard({ ...shared, scope: "mine" });
    expect(mine.actions.map((row) => row.key)).toEqual(["event:e1"]);

    const everyone = buildDashboard({ ...shared, scope: "everyone" });
    expect(everyone.actions.map((row) => row.key)).toEqual([
      "event:e1",
      "enquiry:q1",
      "email:m1",
    ]);
  });
});
