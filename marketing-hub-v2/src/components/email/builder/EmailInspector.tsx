"use client";

import { useState } from "react";
import type {
  EmailAlign,
  EmailBlock,
  EmailDesign,
  EmailSection,
  HeadingLevel,
  SectionPreset,
  SocialNetwork,
} from "@/lib/email/design";
import {
  EMAIL_COLOUR_SWATCHES,
  EMAIL_FONT_OPTIONS,
  ENSIGN_RED,
} from "@/lib/email/design";
import { EMAIL_PREFERENCE_TOPICS } from "@/lib/email/preferences";
import { EmailImageField } from "@/components/email/builder/EmailImageField";
import { cn } from "@/lib/utils";

const MERGE_TOKENS = [
  { token: "{{first_name}}", label: "First name" },
  { token: "{{name}}", label: "Name" },
  { token: "{{organisation}}", label: "Organisation" },
  { token: "{{role}}", label: "Role" },
  { token: "{{email}}", label: "Email" },
  { token: "{{outlet}}", label: "Outlet" },
  { token: "{{country}}", label: "Country" },
  { token: "{{unsubscribe_url}}", label: "Unsubscribe URL" },
  { token: "{{preferences_url}}", label: "Preferences URL" },
  { token: "{{view_in_browser_url}}", label: "View in browser URL" },
] as const;

const PRESETS: { id: SectionPreset; label: string }[] = [
  { id: "1", label: "1 column" },
  { id: "2", label: "2 columns (50/50)" },
  { id: "third-left", label: "1/3 : 2/3" },
  { id: "third-right", label: "2/3 : 1/3" },
  { id: "3", label: "3 columns" },
  { id: "4", label: "4 columns" },
  { id: "image-left", label: "Image left (40/60)" },
  { id: "image-right", label: "Image right (60/40)" },
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

function isBrandSwatch(value: string): boolean {
  const hex = value.trim().toLowerCase();
  return EMAIL_COLOUR_SWATCHES.some((swatch) => swatch.toLowerCase() === hex);
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
  const [otherOpen, setOtherOpen] = useState(() => !isBrandSwatch(value));
  const brandSelected = isBrandSwatch(value);

  return (
    <div className="block text-sm">
      <span className="text-muted">{label}</span>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {EMAIL_COLOUR_SWATCHES.map((hex) => (
          <button
            key={hex}
            type="button"
            title={hex}
            aria-label={hex}
            className={cn(
              "h-6 w-6 rounded border",
              brandSelected && value.toLowerCase() === hex.toLowerCase()
                ? "border-[#007DC5] ring-1 ring-[#007DC5]"
                : "border-border"
            )}
            style={{ background: hex }}
            onClick={() => {
              setOtherOpen(false);
              onChange(hex);
            }}
          />
        ))}
        <button
          type="button"
          className={cn(
            "rounded border px-2 py-0.5 text-[11px]",
            otherOpen || !brandSelected
              ? "border-[#007DC5] text-[#007DC5]"
              : "border-border text-muted"
          )}
          onClick={() => setOtherOpen(true)}
        >
          Other
        </button>
      </div>
      {otherOpen || !brandSelected ? (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="color"
            aria-label={`${label} picker`}
            className="h-9 w-10 cursor-pointer rounded border border-border bg-white p-0.5"
            value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#0B2545"}
            onChange={(event) => {
              if (acceptColour(event.target.value)) onChange(event.target.value);
            }}
          />
          <input
            className="input min-w-0 flex-1 font-mono text-xs"
            value={value}
            placeholder="#0B2545"
            onChange={(event) => {
              if (acceptColour(event.target.value)) onChange(event.target.value);
            }}
          />
        </div>
      ) : null}
      {!acceptColour(value) ? (
        <p className="mt-1 text-[10px] text-red-700">
          Ensign Red is for logo artwork only — pick another colour.
        </p>
      ) : null}
    </div>
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
  onSelectEmail,
  onSelectSection,
  onDesign,
  onSection,
  onPreset,
  onColumnWidths,
  onBlock,
  onInsertMerge,
  onRewrite,
  rewriting,
}: {
  design: EmailDesign;
  section: EmailSection | null;
  block: EmailBlock | null;
  disabled?: boolean;
  onSelectEmail: () => void;
  onSelectSection?: () => void;
  onDesign: (patch: Partial<EmailDesign["styles"]>) => void;
  onSection: (patch: Partial<EmailSection>) => void;
  onPreset: (preset: SectionPreset) => void;
  onColumnWidths?: (widths: number[]) => void;
  onBlock: (patch: Partial<EmailBlock>) => void;
  onInsertMerge?: (token: string) => void;
  onRewrite?: (tone: "clearer" | "shorter" | "more_formal") => void;
  rewriting?: boolean;
}) {
  return (
    <aside className="w-72 shrink-0 overflow-y-auto border-l border-border bg-white p-4">
      <nav className="mb-3 flex flex-wrap items-center gap-1 text-xs text-muted">
        <button
          type="button"
          className="hover:text-brand hover:underline"
          onClick={onSelectEmail}
        >
          Email
        </button>
        {section ? (
          <>
            <span aria-hidden>/</span>
            <button
              type="button"
              className="hover:text-brand hover:underline"
              onClick={onSelectSection}
            >
              Section
            </button>
          </>
        ) : null}
        {block ? (
          <>
            <span aria-hidden>/</span>
            <span className="capitalize text-brand">{block.type}</span>
          </>
        ) : null}
      </nav>
      <fieldset disabled={disabled} className="space-y-4 disabled:opacity-60">
        {block ? (
          <BlockFields
            block={block}
            onBlock={onBlock}
            onInsertMerge={onInsertMerge}
            onRewrite={onRewrite}
            rewriting={rewriting}
          />
        ) : section ? (
          <>
            <p className="text-sm font-medium text-brand">Edit section</p>
            <label className="block text-sm">
              <span className="text-muted">Layout (desktop)</span>
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
            {onColumnWidths && section.columns.length > 1 ? (
              <div className="space-y-2">
                <p className="text-sm text-muted">Column widths (%)</p>
                <div className="grid grid-cols-2 gap-2">
                  {section.columns.map((column, index) => (
                    <NumberField
                      key={column.id}
                      label={`Col ${index + 1}`}
                      value={column.width}
                      min={5}
                      max={95}
                      onChange={(width) => {
                        const widths = section.columns.map((col) => col.width);
                        widths[index] = width;
                        onColumnWidths(widths);
                      }}
                    />
                  ))}
                </div>
              </div>
            ) : null}
            <label className="block text-sm">
              <span className="text-muted">Column alignment</span>
              <select
                className="input mt-1 w-full"
                value={section.verticalAlign ?? "top"}
                onChange={(event) =>
                  onSection({
                    verticalAlign: event.target.value as EmailSection["verticalAlign"],
                  })
                }
              >
                <option value="top">Top</option>
                <option value="middle">Middle</option>
                <option value="bottom">Bottom</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-muted">Mobile stacking</span>
              <select
                className="input mt-1 w-full"
                value={section.mobileStack ?? "default"}
                onChange={(event) =>
                  onSection({
                    mobileStack: event.target.value as EmailSection["mobileStack"],
                  })
                }
              >
                <option value="default">Left on top of right</option>
                <option value="reverse">Right on top of left</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-muted">Show for audience topic</span>
              <select
                className="input mt-1 w-full"
                value={section.showFor ?? "all"}
                onChange={(event) =>
                  onSection({
                    showFor: event.target.value as EmailSection["showFor"],
                  })
                }
              >
                <option value="all">Everyone (all topics)</option>
                {EMAIL_PREFERENCE_TOPICS.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={section.locked === true}
                onChange={(event) => onSection({ locked: event.target.checked })}
              />
              Brand-locked section
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
            <p className="text-sm font-medium text-brand">Padding</p>
            <div className="grid grid-cols-2 gap-2">
              <NumberField
                label="Top"
                value={section.paddingTop}
                onChange={(paddingTop) => onSection({ paddingTop })}
              />
              <NumberField
                label="Bottom"
                value={section.paddingBottom}
                onChange={(paddingBottom) => onSection({ paddingBottom })}
              />
              <NumberField
                label="Left"
                value={section.paddingLeft}
                onChange={(paddingLeft) => onSection({ paddingLeft })}
              />
              <NumberField
                label="Right"
                value={section.paddingRight}
                onChange={(paddingRight) => onSection({ paddingRight })}
              />
            </div>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-brand">Email</p>
            <label className="block text-sm">
              <span className="text-muted">Body font</span>
              <select
                className="input mt-1 w-full"
                value={design.styles.fontFamily}
                onChange={(event) => onDesign({ fontFamily: event.target.value })}
              >
                {EMAIL_FONT_OPTIONS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-muted">Heading font</span>
              <select
                className="input mt-1 w-full"
                value={design.styles.headingFontFamily}
                onChange={(event) =>
                  onDesign({ headingFontFamily: event.target.value })
                }
              >
                {EMAIL_FONT_OPTIONS.map((item) => (
                  <option key={`h-${item.id}`} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
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
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={design.styles.brandLocked === true}
                onChange={(event) =>
                  onDesign({ brandLocked: event.target.checked })
                }
              />
              Lock brand sections (header/footer marked locked)
            </label>
            <p className="border-t border-border pt-4 text-xs text-muted">
              Unsubscribe and preference pages are under{" "}
              <span className="font-medium text-brand">Email → Settings</span>.
            </p>
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
  if (widths === "33,67") return "third-left";
  if (widths === "67,33") return "third-right";
  if (section.columns.length === 4) return "4";
  if (section.columns.length === 3) return "3";
  if (section.columns.length === 2) return "2";
  return "1";
}

function BlockFields({
  block,
  onBlock,
  onInsertMerge,
  onRewrite,
  rewriting,
}: {
  block: EmailBlock;
  onBlock: (patch: Partial<EmailBlock>) => void;
  onInsertMerge?: (token: string) => void;
  onRewrite?: (tone: "clearer" | "shorter" | "more_formal") => void;
  rewriting?: boolean;
}) {
  return (
    <>
      <p className="text-sm font-medium capitalize text-brand">{block.type}</p>
      {block.type === "heading" ? (
        <>
          <TextInput
            label="Text"
            value={block.text}
            onChange={(text) => onBlock({ text } as Partial<EmailBlock>)}
          />
          <label className="block text-sm">
            <span className="text-muted">Level</span>
            <select
              className="input mt-1 w-full"
              value={block.level ?? 1}
              onChange={(event) =>
                onBlock({
                  level: Number(event.target.value) as HeadingLevel,
                } as Partial<EmailBlock>)
              }
            >
              <option value={1}>Heading 1</option>
              <option value={2}>Heading 2</option>
              <option value={3}>Heading 3</option>
            </select>
          </label>
          <NumberField
            label="Size"
            value={block.fontSize}
            min={14}
            max={48}
            onChange={(fontSize) => onBlock({ fontSize } as Partial<EmailBlock>)}
          />
          <ColourField
            label="Colour"
            value={block.color}
            onChange={(color) => onBlock({ color } as Partial<EmailBlock>)}
          />
          <MergeInsert
            onInsert={(token) =>
              onInsertMerge
                ? onInsertMerge(token)
                : onBlock({ text: `${block.text} ${token}` } as Partial<EmailBlock>)
            }
          />
          {onRewrite ? (
            <RewriteControls rewriting={rewriting} onRewrite={onRewrite} />
          ) : null}
        </>
      ) : null}
      {block.type === "text" ? (
        <>
          <NumberField
            label="Size"
            value={block.fontSize}
            min={12}
            max={28}
            onChange={(fontSize) => onBlock({ fontSize } as Partial<EmailBlock>)}
          />
          <ColourField
            label="Colour"
            value={block.color}
            onChange={(color) => onBlock({ color } as Partial<EmailBlock>)}
          />
          <MergeInsert
            onInsert={(token) =>
              onInsertMerge
                ? onInsertMerge(token)
                : onBlock({ html: `${block.html}${token}` } as Partial<EmailBlock>)
            }
          />
          {onRewrite ? (
            <RewriteControls rewriting={rewriting} onRewrite={onRewrite} />
          ) : null}
        </>
      ) : null}
      {block.type === "video" ? (
        <>
          <EmailImageField
            src={block.thumbnailSrc}
            onChange={(thumbnailSrc) =>
              onBlock({ thumbnailSrc } as Partial<EmailBlock>)
            }
          />
          <TextInput
            label="Alt text"
            value={block.alt}
            onChange={(alt) => onBlock({ alt } as Partial<EmailBlock>)}
          />
          <TextInput
            label="Video URL"
            value={block.videoUrl}
            onChange={(videoUrl) => onBlock({ videoUrl } as Partial<EmailBlock>)}
          />
          <NumberField
            label="Width %"
            value={block.widthPercent}
            min={10}
            max={100}
            onChange={(widthPercent) =>
              onBlock({ widthPercent } as Partial<EmailBlock>)
            }
          />
        </>
      ) : null}
      {block.type === "quote" ? (
        <>
          <label className="block text-sm">
            <span className="text-muted">Quote</span>
            <textarea
              className="input mt-1 min-h-[80px] w-full"
              value={block.text}
              onChange={(event) =>
                onBlock({ text: event.target.value } as Partial<EmailBlock>)
              }
            />
          </label>
          <TextInput
            label="Attribution"
            value={block.attribution}
            onChange={(attribution) =>
              onBlock({ attribution } as Partial<EmailBlock>)
            }
          />
          <NumberField
            label="Size"
            value={block.fontSize}
            min={14}
            max={36}
            onChange={(fontSize) => onBlock({ fontSize } as Partial<EmailBlock>)}
          />
          <ColourField
            label="Text"
            value={block.color}
            onChange={(color) => onBlock({ color } as Partial<EmailBlock>)}
          />
          <ColourField
            label="Accent"
            value={block.accentColor}
            onChange={(accentColor) =>
              onBlock({ accentColor } as Partial<EmailBlock>)
            }
          />
        </>
      ) : null}
      {block.type === "content_card" ? (
        <>
          <TextInput
            label="Title"
            value={block.title}
            onChange={(title) => onBlock({ title } as Partial<EmailBlock>)}
          />
          <EmailImageField
            src={block.imageSrc}
            onChange={(imageSrc) =>
              onBlock({ imageSrc } as Partial<EmailBlock>)
            }
          />
          <label className="block text-sm">
            <span className="text-muted">Summary HTML</span>
            <textarea
              className="input mt-1 min-h-[80px] w-full font-mono text-xs"
              value={block.bodyHtml}
              onChange={(event) =>
                onBlock({ bodyHtml: event.target.value } as Partial<EmailBlock>)
              }
            />
          </label>
          <TextInput
            label="Button label"
            value={block.ctaLabel}
            onChange={(ctaLabel) =>
              onBlock({ ctaLabel } as Partial<EmailBlock>)
            }
          />
          <TextInput
            label="Button link"
            value={block.ctaHref}
            onChange={(ctaHref) => onBlock({ ctaHref } as Partial<EmailBlock>)}
          />
          <TextInput
            label="Hub content id (optional)"
            value={block.contentId}
            onChange={(contentId) =>
              onBlock({ contentId } as Partial<EmailBlock>)
            }
          />
        </>
      ) : null}
      {block.type === "image" || block.type === "logo" ? (
        <>
          <EmailImageField
            src={block.src}
            onChange={(src) => onBlock({ src } as Partial<EmailBlock>)}
          />
          <TextInput
            label="Alt text"
            value={block.alt}
            onChange={(alt) => onBlock({ alt } as Partial<EmailBlock>)}
          />
          <TextInput
            label="Link"
            value={block.href}
            onChange={(href) => onBlock({ href } as Partial<EmailBlock>)}
          />
          {block.type === "image" ? (
            <NumberField
              label="Width %"
              value={block.widthPercent}
              min={10}
              max={100}
              onChange={(widthPercent) =>
                onBlock({ widthPercent } as Partial<EmailBlock>)
              }
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
          <TextInput
            label="Label"
            value={block.label}
            onChange={(label) => onBlock({ label } as Partial<EmailBlock>)}
          />
          <TextInput
            label="Link"
            value={block.href}
            onChange={(href) => onBlock({ href } as Partial<EmailBlock>)}
          />
          <ColourField
            label="Colour"
            value={block.background}
            onChange={(background) =>
              onBlock({ background } as Partial<EmailBlock>)
            }
          />
          <ColourField
            label="Text"
            value={block.color}
            onChange={(color) => onBlock({ color } as Partial<EmailBlock>)}
          />
          <NumberField
            label="Font size"
            value={block.fontSize ?? 16}
            min={12}
            max={28}
            onChange={(fontSize) => onBlock({ fontSize } as Partial<EmailBlock>)}
          />
          <NumberField
            label="Padding X"
            value={block.paddingX ?? 22}
            min={8}
            max={48}
            onChange={(paddingX) => onBlock({ paddingX } as Partial<EmailBlock>)}
          />
          <NumberField
            label="Padding Y"
            value={block.paddingY ?? 14}
            min={6}
            max={40}
            onChange={(paddingY) => onBlock({ paddingY } as Partial<EmailBlock>)}
          />
          <NumberField
            label="Radius"
            value={block.radius}
            max={40}
            onChange={(radius) => onBlock({ radius } as Partial<EmailBlock>)}
          />
          <ColourField
            label="Border"
            value={block.borderColor || block.background}
            onChange={(borderColor) =>
              onBlock({ borderColor } as Partial<EmailBlock>)
            }
          />
          <NumberField
            label="Border width"
            value={block.borderWidth ?? 0}
            max={8}
            onChange={(borderWidth) =>
              onBlock({ borderWidth } as Partial<EmailBlock>)
            }
          />
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
          <ColourField
            label="Colour"
            value={block.color}
            onChange={(color) => onBlock({ color } as Partial<EmailBlock>)}
          />
          <NumberField
            label="Thickness"
            value={block.thickness}
            min={1}
            max={8}
            onChange={(thickness) =>
              onBlock({ thickness } as Partial<EmailBlock>)
            }
          />
        </>
      ) : null}
      {block.type === "spacer" ? (
        <NumberField
          label="Height"
          value={block.height}
          min={4}
          max={200}
          onChange={(height) => onBlock({ height } as Partial<EmailBlock>)}
        />
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
          <p className="text-xs text-muted">Leave a URL blank to hide that network.</p>
        </div>
      ) : null}
      {block.type === "html" ? (
        <label className="block text-sm">
          <span className="text-muted">HTML</span>
          <textarea
            className="input mt-1 min-h-[160px] w-full font-mono text-xs"
            value={block.html}
            onChange={(event) =>
              onBlock({ html: event.target.value } as Partial<EmailBlock>)
            }
          />
          <span className="mt-1 block text-xs text-muted">
            Scripts and iframes are removed when the email is sent.
          </span>
        </label>
      ) : null}
      {block.type === "footer" ? (
        <>
          <label className="block text-sm">
            <span className="text-muted">Address</span>
            <textarea
              className="input mt-1 min-h-[120px] w-full"
              value={block.text}
              onChange={(event) =>
                onBlock({ text: event.target.value } as Partial<EmailBlock>)
              }
            />
          </label>
          <p className="text-xs text-muted">
            Unsubscribe and preference links are set under Email → Settings.
          </p>
        </>
      ) : null}
      {block.type !== "spacer" && block.type !== "divider" ? (
        <AlignField value={block.align} onChange={(align) => onBlock({ align })} />
      ) : null}
      <p className="text-sm font-medium text-brand">Padding</p>
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Top"
          value={block.paddingTop}
          onChange={(paddingTop) => onBlock({ paddingTop })}
        />
        <NumberField
          label="Bottom"
          value={block.paddingBottom}
          onChange={(paddingBottom) => onBlock({ paddingBottom })}
        />
        <NumberField
          label="Left"
          value={block.paddingLeft}
          onChange={(paddingLeft) => onBlock({ paddingLeft })}
        />
        <NumberField
          label="Right"
          value={block.paddingRight}
          onChange={(paddingRight) => onBlock({ paddingRight })}
        />
      </div>
    </>
  );
}

function RewriteControls({
  rewriting,
  onRewrite,
}: {
  rewriting?: boolean;
  onRewrite: (tone: "clearer" | "shorter" | "more_formal") => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-sm text-muted">Rewrite with AI</p>
      <div className="flex flex-wrap gap-1">
        {(
          [
            ["clearer", "Clearer"],
            ["shorter", "Shorter"],
            ["more_formal", "More formal"],
          ] as const
        ).map(([tone, label]) => (
          <button
            key={tone}
            type="button"
            className="btn-secondary px-2 py-1 text-xs"
            disabled={rewriting}
            onClick={() => onRewrite(tone)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function MergeInsert({ onInsert }: { onInsert: (token: string) => void }) {
  return (
    <label className="block text-sm">
      <span className="text-muted">Personalise</span>
      <select
        className="input mt-1 w-full"
        value=""
        onChange={(event) => {
          if (event.target.value) onInsert(event.target.value);
        }}
      >
        <option value="">Choose…</option>
        {MERGE_TOKENS.map((item) => (
          <option key={item.token} value={item.token}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}
