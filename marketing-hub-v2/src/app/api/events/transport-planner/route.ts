import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { listEvents } from "@/lib/data/repos";
import { toPublicPlannerEvent } from "@/lib/events/planner";

function secretOk(request: NextRequest): boolean {
  const expected = process.env.TRANSPORT_PLANNER_FEED_SECRET || "";
  if (!expected) return false;
  const provided =
    request.headers.get("x-planner-secret") ||
    request.nextUrl.searchParams.get("secret") ||
    "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * GET /api/events/transport-planner
 * Public-field feed for the website. Shared secret, not a staff session.
 */
export async function GET(request: NextRequest) {
  if (!process.env.TRANSPORT_PLANNER_FEED_SECRET) {
    return NextResponse.json(
      { error: "Transport planner feed is not configured" },
      { status: 503 }
    );
  }
  if (!secretOk(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const events = await listEvents();
    const publicEvents = events
      .map((event) =>
        toPublicPlannerEvent({
          ...event,
          location: event.location || "",
          link_url: event.link_url || "",
        })
      )
      .filter((event): event is NonNullable<typeof event> => event !== null);

    return NextResponse.json(
      { events: publicEvents, generated_at: new Date().toISOString() },
      { headers: { "Cache-Control": "private, max-age=300" } }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load events" },
      { status: 500 }
    );
  }
}
