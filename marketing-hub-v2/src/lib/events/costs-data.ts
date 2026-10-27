import { readStore, updateStore } from "@/lib/store/local";
import { uid } from "@/lib/utils";
import type {
  EventCostCategory,
  EventCostCurrency,
  EventCostLine,
  HubNotification,
} from "@/lib/types";

function nowIso() {
  return new Date().toISOString();
}

export async function listEventCostLines(eventId: string) {
  const store = await readStore();
  return (store.event_cost_lines ?? [])
    .filter((row) => row.event_id === eventId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function getEventCostLine(id: string) {
  const store = await readStore();
  return (store.event_cost_lines ?? []).find((row) => row.id === id) ?? null;
}

export async function saveEventCostLine(input: {
  id?: string;
  event_id: string;
  category: EventCostCategory;
  description: string;
  amount: number | null;
  currency: EventCostCurrency;
  staff_user_id: string | null;
  staff_name: string;
  notes: string;
}): Promise<EventCostLine | null> {
  let row: EventCostLine | null = null;
  await updateStore((store) => {
    if (!store.event_cost_lines) store.event_cost_lines = [];
    const fields = {
      category: input.category,
      description: input.description.trim(),
      amount: input.amount,
      currency: input.currency,
      staff_user_id: input.staff_user_id,
      staff_name: input.staff_name.trim(),
      notes: input.notes.trim(),
      updated_at: nowIso(),
    };
    if (input.id) {
      const idx = store.event_cost_lines.findIndex((item) => item.id === input.id);
      if (idx === -1) return;
      store.event_cost_lines[idx] = { ...store.event_cost_lines[idx], ...fields };
      row = store.event_cost_lines[idx];
      return;
    }
    row = {
      id: uid("ecl"),
      event_id: input.event_id,
      ...fields,
      created_at: nowIso(),
    };
    store.event_cost_lines.push(row);
  });
  return row;
}

export async function removeEventCostLine(id: string) {
  await updateStore((store) => {
    store.event_cost_lines = (store.event_cost_lines ?? []).filter((row) => row.id !== id);
  });
}

/** Home reminder. Repeat requests add a fresh reminder rather than being dropped. */
export async function addHubNotification(
  input: Pick<HubNotification, "user_id" | "title" | "body" | "href">
): Promise<HubNotification> {
  const row: HubNotification = {
    ...input,
    id: uid("ntf"),
    read_at: null,
    created_at: nowIso(),
  };
  await updateStore((store) => {
    if (!store.notifications) store.notifications = [];
    store.notifications.push(row);
  });
  return row;
}
