"use client";

import {
  Code,
  Columns2,
  Heading,
  Image as ImageIcon,
  Link2,
  Minus,
  PanelBottom,
  Share2,
  Space,
  Square,
  Type,
} from "lucide-react";
import type { EmailBlockType, SectionPreset, StarterLayout } from "@/lib/email/design";
import { writeDrag } from "@/components/email/builder/drag";

const BLOCKS: { type: EmailBlockType; label: string; icon: typeof Type }[] = [
  { type: "heading", label: "Heading", icon: Heading },
  { type: "text", label: "Text", icon: Type },
  { type: "image", label: "Image", icon: ImageIcon },
  { type: "button", label: "Button", icon: Square },
  { type: "divider", label: "Divider", icon: Minus },
  { type: "spacer", label: "Spacer", icon: Space },
  { type: "social", label: "Social", icon: Share2 },
  { type: "logo", label: "Logo", icon: Link2 },
  { type: "html", label: "HTML", icon: Code },
  { type: "footer", label: "Footer", icon: PanelBottom },
];

const LAYOUTS: { preset: SectionPreset; label: string }[] = [
  { preset: "1", label: "1 column" },
  { preset: "2", label: "2 columns" },
  { preset: "3", label: "3 columns" },
  { preset: "4", label: "4 columns" },
  { preset: "image-left", label: "Image left" },
  { preset: "image-right", label: "Image right" },
];

const STARTERS: { id: StarterLayout; label: string; detail: string }[] = [
  { id: "blank", label: "Blank", detail: "A short note and a footer" },
  { id: "newsletter", label: "Newsletter", detail: "Logo, story, button, social" },
  { id: "announcement", label: "Announcement", detail: "Centred update with a button" },
];

export function EmailPalette({
  tab,
  onTab,
  disabled,
  onAddBlock,
  onAddSection,
  onStarter,
}: {
  tab: "content" | "layouts";
  onTab: (tab: "content" | "layouts") => void;
  disabled?: boolean;
  onAddBlock: (type: EmailBlockType) => void;
  onAddSection: (preset: SectionPreset) => void;
  onStarter: (layout: StarterLayout) => void;
}) {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-white">
      <div className="grid grid-cols-2 border-b border-border">
        {(["content", "layouts"] as const).map((id) => (
          <button
            key={id}
            type="button"
            className={
              tab === id
                ? "border-b-2 border-brand px-2 py-2 text-sm font-medium text-brand"
                : "px-2 py-2 text-sm text-muted"
            }
            onClick={() => onTab(id)}
          >
            {id === "content" ? "Content" : "Layouts"}
          </button>
        ))}
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {tab === "content"
          ? BLOCKS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.type}
                  type="button"
                  draggable={!disabled}
                  disabled={disabled}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50"
                  onClick={() => onAddBlock(item.type)}
                  onDragStart={(event) =>
                    writeDrag(event, { source: "block", blockType: item.type })
                  }
                >
                  <Icon className="h-4 w-4 text-muted" />
                  {item.label}
                </button>
              );
            })
          : (
            <>
              <p className="px-2 pt-1 text-xs text-muted">Start from</p>
              {STARTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={disabled}
                  className="block w-full rounded-lg px-2 py-2 text-left hover:bg-slate-50 disabled:opacity-50"
                  onClick={() => onStarter(item.id)}
                >
                  <span className="block text-sm">{item.label}</span>
                  <span className="block text-xs text-muted">{item.detail}</span>
                </button>
              ))}
              <p className="px-2 pt-3 text-xs text-muted">Sections</p>
              {LAYOUTS.map((item) => (
                <button
                  key={item.preset}
                  type="button"
                  draggable={!disabled}
                  disabled={disabled}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50"
                  onClick={() => onAddSection(item.preset)}
                  onDragStart={(event) =>
                    writeDrag(event, { source: "section", preset: item.preset })
                  }
                >
                  <Columns2 className="h-4 w-4 text-muted" />
                  {item.label}
                </button>
              ))}
            </>
          )}
      </div>
    </aside>
  );
}
