import type { BounceClass } from "@/lib/email/resend-event";

/** Temporary failures kept on the list until this many in a row. */
export const SOFT_BOUNCE_LIMIT = 3;

export const HARD_BOUNCE_NOTE = "Hard bounce. Removed from future sends.";
export const SOFT_BOUNCE_KEPT_NOTE = "Temporary bounce. Still on the list.";

export function repeatedSoftBounceNote(count = SOFT_BOUNCE_LIMIT): string {
  return `Temporary bounce, ${count} times. Removed from future sends.`;
}

export function bounceEventMeta(bounceClass: BounceClass): string {
  return bounceClass === "hard" ? "email.bounced:hard" : "email.bounced:soft";
}

export function bounceClassFromMeta(meta: string): BounceClass | null {
  if (meta.endsWith(":hard")) return "hard";
  if (meta.endsWith(":soft")) return "soft";
  return null;
}

/** Report line for a bounce that has not been written as a suppression yet. */
export function bounceListNote(meta: string | undefined): string | undefined {
  const bounceClass = bounceClassFromMeta(meta ?? "");
  if (bounceClass === "soft") return SOFT_BOUNCE_KEPT_NOTE;
  if (bounceClass === "hard") return HARD_BOUNCE_NOTE;
  return undefined;
}

export type BounceMark = {
  kind: "bounced" | "delivered";
  meta: string;
  createdAt: string;
  messageId: string;
};

/**
 * Hard bounces are removed at once. Soft bounces stay until this many
 * have arrived since the last successful delivery. A repeated webhook
 * for the same message counts once.
 */
export function shouldSuppressBounce(input: {
  bounceClass: BounceClass;
  events: BounceMark[];
}): { suppress: boolean; softCount: number } {
  if (input.bounceClass === "hard") return { suppress: true, softCount: 0 };

  const seen = new Set<string>();
  const marks = input.events
    .filter((event) => {
      const key = event.messageId
        ? `${event.kind}:${event.messageId}`
        : `${event.kind}:${event.createdAt}:${event.meta}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

  let softCount = 0;
  for (let i = marks.length - 1; i >= 0; i -= 1) {
    const event = marks[i];
    if (event.kind === "delivered") break;
    if (event.kind !== "bounced") continue;
    const bounceClass = bounceClassFromMeta(event.meta);
    if (bounceClass === "hard") return { suppress: true, softCount };
    softCount += 1;
  }

  return { suppress: softCount >= SOFT_BOUNCE_LIMIT, softCount };
}
