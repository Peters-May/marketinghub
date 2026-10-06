import type { EmailBlockType, SectionPreset } from "@/lib/email/design";

export type DesignerDrag =
  | { source: "block"; blockType: EmailBlockType }
  | { source: "section"; preset: SectionPreset }
  | { source: "move"; blockId: string };

export const DESIGNER_DRAG_MIME = "application/x-hub-email";

export function writeDrag(event: React.DragEvent, payload: DesignerDrag) {
  const json = JSON.stringify(payload);
  event.dataTransfer.setData(DESIGNER_DRAG_MIME, json);
  event.dataTransfer.setData("text/plain", json);
  event.dataTransfer.effectAllowed = payload.source === "move" ? "move" : "copy";
}

export function readDrag(event: React.DragEvent): DesignerDrag | null {
  const raw =
    event.dataTransfer.getData(DESIGNER_DRAG_MIME) ||
    event.dataTransfer.getData("text/plain");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DesignerDrag;
    if (!parsed || typeof parsed !== "object" || !("source" in parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}
