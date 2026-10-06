"use client";

import type {
  EmailAlign,
  EmailBlock,
  EmailDesign,
  EmailSection,
  SectionPreset,
  SocialNetwork,
} from "@/lib/email/design";
import { EMAIL_COLOUR_SWATCHES, ENSIGN_RED } from "@/lib/email/design";

const MERGE_TOKENS = [
  "{{name}}",
  "{{first_name}}",
  "{{organisation}}",
  "{{email}}",
  "{{country}}",
] as const;

const PRESETS: { id: SectionPreset; label: string }[] = [
  { id: "1", label: "1 column" },
  { id: "2", label: "2 columns" },
  { id: "3", label: "3 columns" },
  { id: "4", label: "4 columns" },
  { id: "image-left", label: "Image left" },
  { id: "image-right", label: "Image right" },
];

const SOCIAL_LABEL: Record<SocialNetwork, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  youtube: "YouTube",
  facebook: "Facebook",
};

function acceptColour(value: string): boolean {
  return value.trim().toLowerCase() !== ENSIGN_RED.toLowerCase();
}

function ColourField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="text-muted">{label}</span>
      <div className="mt-1 flex flex-wrap gap-1">
        {EMAIL_COLOUR_SWATCHES.map((hex) => (
          <button
            key={hex}
            type="button"
            title={hex}
            aria-label={hex}
            className="h-6 w-6 rounded border border-border"
            style={{ background: hex }}
            onClick={() => onChange(hex)}
          />
        ))}
      </div>
      <input
        className="input mt-2 w-full"
        value={value}
        onChange={(event) => {
          if (acceptColour(event.target.value)) onChange(event.target.value);
        }}
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 200,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="block text-sm">
      <span className="text-muted">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        className="input mt-1 w-full"
        value={value}
        onChange={(event) => {
        const next = Number(event.target.value);
        if (Number.isFinite(next)) onChange(next);
      }}
      />
    </label>
  );
}

function AlignField({
  value,
  onChange,
}: {
  value: EmailAlign;
  onChange: (value: EmailAlign) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="text-muted">Alignment</span>
      <select
        className="input mt-1 w-full"
        value={value}
        onChange={(event) => onChange(event.target.value as EmailAlign)}
      >
        <option value="left">Left</option>
        <option value="center">Centre</option>
        <option value="right">Right</option>
      </select>
    </label>
  );
}

function TextInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="text-muted">{label}</span>
      <input
        className="input mt-1 w-full"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function EmailInspector({
  design,
  section,
  block,
  disabled,
  onDesign,
  onSection,
  onPreset,
  onBlock,
}: {
  design: EmailDesign;
  section: EmailSection | null;
  block: EmailBlock | null;
  disabled?: boolean;
  onDesign: (patch: Partial<EmailDesign["styles"]>) => void;
  onSection: (patch: Partial<EmailSection>) => void;
  onPreset: (preset: SectionPreset) => void;
  onBlock: (patch: Partial<EmailBlock>) => void;
}) {
  return (
    <aside className="w-72 shrink-0 overflow-y-auto border-l border-border bg-white p-4">
      <fieldset disabled={disabled} className="space-y-4 disabled:opacity-60">
        {block ? (
          <BlockFields block={block} onBlock={onBlock} />
        ) : section ? (
          <>
            <p className="text-sm font-medium text-brand">Section</p>
            <label className="block text-sm">
              <span className="text-muted">Columns</span>
              <select
                className="input mt-1 w-full"
                value={presetFor(section)}
                onChange={(event) => onPreset(event.target.value as SectionPreset)}
              >
                {PRESETS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <ColourField
              label="Background"
              value={section.background}
              onChange={(background) => onSection({ background })}
            />
            <NumberField
              label="Gap"
              value={section.columnGap}
              onChange={(columnGap) => onSection({ columnGap })}
            />
            <div className="grid grid-cols-2 gap-2">
              <NumberField
                label="Padding top"
                value={section.paddingTop}
                onChange={(paddingTop) => onSection({ paddingTop })}
              />
              <NumberField
                label="Padding bottom"
                value={section.paddingBottom}
                onChange={(paddingBottom) => onSection({ paddingBottom })}
              />
            </div>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-brand">Email</p>
            <ColourField
              label="Page background"
              value={design.styles.pageBackground}
              onChange={(pageBackground) => onDesign({ pageBackground })}
            />
            <ColourField
              label="Content background"
              value={design.styles.contentBackground}
              onChange={(contentBackground) => onDesign({ contentBackground })}
            />
            <NumberField
              label="Width"
              value={design.styles.contentWidth}
              min={320}
              max={800}
              onChange={(contentWidth) => onDesign({ contentWidth })}
            />
            <ColourField
              label="Text"
              value={design.styles.textColor}
              onChange={(textColor) => onDesign({ textColor })}
            />
            <ColourField
              label="Links"
              value={design.styles.linkColor}
              onChange={(linkColor) => onDesign({ linkColor })}
            />
            <ColourField
              label="Button"
              value={design.styles.buttonBackground}
              onChange={(buttonBackground) => onDesign({ buttonBackground })}
            />
            <ColourField
              label="Button text"
              value={design.styles.buttonColor}
              onChange={(buttonColor) => onDesign({ buttonColor })}
            />
            <NumberField
              label="Button radius"
              value={design.styles.buttonRadius}
              max={40}
              onChange={(buttonRadius) => onDesign({ buttonRadius })}
            />
          </>
        )}
      </fieldset>
    </aside>
  );
}

function presetFor(section: EmailSection): SectionPreset {
  const widths = section.columns.map((column) => column.width).join(",");
  if (widths === "40,60") return "image-left";
  if (widths === "60,40") return "image-right";
  if (section.columns.length === 4) return "4";
  if (section.columns.length === 3) return "3";
  if (section.columns.length === 2) return "2";
  return "1";
}

function BlockFields({
  block,
  onBlock,
}: {
  block: EmailBlock;
  onBlock: (patch: Partial<EmailBlock>) => void;
}) {
  return (
    <>
      <p className="text-sm font-medium capitalize text-brand">{block.type}</p>
      {block.type === "heading" ? (
        <>
          <TextInput label="Text" value={block.text} onChange={(text) => onBlock({ text } as Partial<EmailBlock>)} />
          <NumberField label="Size" value={block.fontSize} min={14} max={48} onChange={(fontSize) => onBlock({ fontSize } as Partial<EmailBlock>)} />
          <ColourField label="Colour" value={block.color} onChange={(color) => onBlock({ color } as Partial<EmailBlock>)} />
        </>
      ) : null}
      {block.type === "text" ? (
        <>
          <NumberField label="Size" value={block.fontSize} min={12} max={28} onChange={(fontSize) => onBlock({ fontSize } as Partial<EmailBlock>)} />
          <ColourField label="Colour" value={block.color} onChange={(color) => onBlock({ color } as Partial<EmailBlock>)} />
          <MergeInsert
            onInsert={(token) =>
              onBlock({ html: `${block.html}${token}` } as Partial<EmailBlock>)
            }
          />
        </>
      ) : null}
      {block.type === "heading" ? (
        <MergeInsert
          onInsert={(token) => onBlock({ text: `${block.text} ${token}` } as Partial<EmailBlock>)}
        />
      ) : null}
      {block.type === "image" || block.type === "logo" ? (
        <>
          <TextInput label="Image URL" value={block.src} onChange={(src) => onBlock({ src } as Partial<EmailBlock>)} />
          <TextInput label="Alt text" value={block.alt} onChange={(alt) => onBlock({ alt } as Partial<EmailBlock>)} />
          <TextInput label="Link" value={block.href} onChange={(href) => onBlock({ href } as Partial<EmailBlock>)} />
          {block.type === "image" ? (
            <NumberField
              label="Width %"
              value={block.widthPercent}
              min={10}
              max={100}
              onChange={(widthPercent) => onBlock({ widthPercent } as Partial<EmailBlock>)}
            />
          ) : (
            <NumberField
              label="Width"
              value={block.width}
              min={40}
              max={600}
              onChange={(width) => onBlock({ width } as Partial<EmailBlock>)}
            />
          )}
        </>
      ) : null}
      {block.type === "button" ? (
        <>
          <TextInput label="Label" value={block.label} onChange={(label) => onBlock({ label } as Partial<EmailBlock>)} />
          <TextInput label="Link" value={block.href} onChange={(href) => onBlock({ href } as Partial<EmailBlock>)} />
          <ColourField label="Colour" value={block.background} onChange={(background) => onBlock({ background } as Partial<EmailBlock>)} />
          <ColourField label="Text" value={block.color} onChange={(color) => onBlock({ color } as Partial<EmailBlock>)} />
          <NumberField label="Radius" value={block.radius} max={40} onChange={(radius) => onBlock({ radius } as Partial<EmailBlock>)} />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={block.fullWidth}
              onChange={(event) =>
                onBlock({ fullWidth: event.target.checked } as Partial<EmailBlock>)
              }
            />
            Full width
          </label>
        </>
      ) : null}
      {block.type === "divider" ? (
        <>
          <ColourField label="Colour" value={block.color} onChange={(color) => onBlock({ color } as Partial<EmailBlock>)} />
          <NumberField label="Thickness" value={block.thickness} min={1} max={8} onChange={(thickness) => onBlock({ thickness } as Partial<EmailBlock>)} />
        </>
      ) : null}
      {block.type === "spacer" ? (
        <NumberField label="Height" value={block.height} min={4} max={200} onChange={(height) => onBlock({ height } as Partial<EmailBlock>)} />
      ) : null}
      {block.type === "social" ? (
        <div className="space-y-2">
          {block.links.map((link) => (
            <TextInput
              key={link.network}
              label={SOCIAL_LABEL[link.network]}
              value={link.url}
              onChange={(url) =>
                onBlock({
                  links: block.links.map((item) =>
                    item.network === link.network ? { ...item, url } : item
                  ),
                } as Partial<EmailBlock>)
              }
            />
          ))}
        </div>
      ) : null}
      {block.type === "html" ? (
        <label className="block text-sm">
          <span className="text-muted">HTML</span>
          <textarea
            className="input mt-1 min-h-[160px] w-full font-mono text-xs"
            value={block.html}
            onChange={(event) => onBlock({ html: event.target.value } as Partial<EmailBlock>)}
          />
        </label>
      ) : null}
      {block.type === "footer" ? (
        <TextInput label="Text" value={block.text} onChange={(text) => onBlock({ text } as Partial<EmailBlock>)} />
      ) : null}
      {block.type !== "spacer" && block.type !== "divider" ? (
        <AlignField value={block.align} onChange={(align) => onBlock({ align })} />
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Pad top" value={block.paddingTop} onChange={(paddingTop) => onBlock({ paddingTop })} />
        <NumberField label="Pad bottom" value={block.paddingBottom} onChange={(paddingBottom) => onBlock({ paddingBottom })} />
      </div>
    </>
  );
}

function MergeInsert({ onInsert }: { onInsert: (token: string) => void }) {
  return (
    <label className="block text-sm">
      <span className="text-muted">Insert merge field</span>
      <select
        className="input mt-1 w-full"
        value=""
        onChange={(event) => {
          if (event.target.value) onInsert(event.target.value);
        }}
      >
        <option value="">Choose…</option>
        {MERGE_TOKENS.map((token) => (
          <option key={token} value={token}>
            {token}
          </option>
        ))}
      </select>
    </label>
  );
}
