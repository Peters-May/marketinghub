import type { EventBooking } from "@/lib/types";

/** Booking references stay off the response unless the viewer is an admin or the attendee. */
export function presentBooking(
  booking: EventBooking,
  viewer: { id: string; isAdmin: boolean }
): EventBooking {
  const shared = !booking.attendee_user_id;
  const canSee =
    viewer.isAdmin || (!shared && booking.attendee_user_id === viewer.id);
  if (canSee) return booking;
  return { ...booking, reference: "" };
}
