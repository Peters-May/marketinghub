import { isClosedTaskStatus } from "@/lib/data/collections";
import { readStore } from "@/lib/store/local";

/** A short read of live hub records for the assistant. It cannot change them. */
export async function assistantReadContext() {
  const store = await readStore();
  const today = new Date().toISOString().slice(0, 10);
  const tasks = (store.tasks ?? [])
    .filter((task) => !isClosedTaskStatus(task.status))
    .slice(0, 12)
    .map((task) => {
      const due = task.due_date ? ` due ${task.due_date}` : "";
      const owner = task.owner ? ` (${task.owner})` : "";
      return `- Task: ${task.title}${due}${owner}`;
    });
    const events = (store.events ?? [])
    .filter((event) => event.starts_at && event.starts_at.slice(0, 10) >= today)
    .sort((a, b) => (a.starts_at ?? "").localeCompare(b.starts_at ?? ""))
    .slice(0, 20)
    .map((event) => {
      const going = event.pm_attendance
        ? ` attending ${event.pm_attendance}`
        : event.pm_attending
          ? "Peters & May attending"
          : "watching";
      const end =
        event.ends_at && event.ends_at.slice(0, 10) !== event.starts_at?.slice(0, 10)
          ? ` to ${event.ends_at.slice(0, 10)}`
          : "";
      return `- Event: ${event.title} on ${event.starts_at?.slice(0, 10)}${end} (${going})`;
    });
  const content = (store.content ?? [])
    .filter((item) => item.status === "draft" || item.status === "review")
    .slice(0, 8)
    .map((item) => `- Content: ${item.title} (${item.status})`);
  const lines = [...tasks, ...events, ...content];
  if (lines.length === 0) return "Live hub snapshot: no open tasks, upcoming events, or draft content.";
  return `Live hub snapshot (read only; do not invent extra records):\n${lines.join("\n")}`;
}
