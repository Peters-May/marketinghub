"use client";

import { ChevronDown, ChevronUp, Copy, GripVertical, Trash2 } from "lucide-react";
import type { EmailBlock, EmailDesign } from "@/lib/email/design";
import { safeEmailUrl, sanitizeHtmlBlock, sanitizeRichEmailHtml } from "@/lib/email/design/compile";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { readDrag, writeDrag, type DesignerDrag } from "@/components/email/builder/drag";
import { previewMerge } from "@/lib/email/design/preview";
import { cn } from "@/lib/utils";

export function EmailInboxBar({
  subject,
  previewText,
  width,
}: {
  subject: string;
  previewText: string;
  width: number;
}) {
  return (
    <div
      className="mx-auto rounded-t-lg border border-b-0 border-border bg-white px-4 py-3"
      style={{ width, maxWidth: "100%" }}
      onClick={(event) => event.stopPropagation()}
    >
      <p className="text-sm font-medium text-brand">
        {previewMerge(subject) || "No subject"}
      </p>
      <p className="text-xs text-muted">
        {previewMerge(previewText) || "No preview text"}
      </p>
    </div>
  );
}

export type CanvasSelection =
  | { type: "email" }
  | { type: "section"; sectionId: string }
  | { type: "block"; sectionId: string; columnId: string; blockId: string };

export function EmailCanvas({
  design,
  selection,
  device,
  subject,
  previewText,
  readOnly,
  onSelect,
  onLiveBlock,
  onCommitBlock,
  onDrop,
  onMove,
  onDuplicate,
  onDelete,
  onMoveSection,
  onDuplicateSection,
  onDeleteSection,
}: {
  design: EmailDesign;
  selection: CanvasSelection;
  device: "desktop" | "mobile";
  subject: string;
  previewText: string;
  readOnly?: boolean;
  onSelect: (selection: CanvasSelection) => void;
  onLiveBlock: (blockId: string, patch: Partial<EmailBlock>) => void;
  onCommitBlock: (blockId: string) => void;
  onDrop: (
    payload: DesignerDrag,
    target: { sectionId: string; columnId: string; beforeBlockId: string | null } | { beforeSectionId: string | null }
  ) => void;
  onMove: (blockId: string, direction: -1 | 1) => void;
  onDuplicate: (blockId: string) => void;
  onDelete: (blockId: string) => void;
  onMoveSection: (sectionId: string, direction: -1 | 1) => void;
  onDuplicateSection: (sectionId: string) => void;
  onDeleteSection: (sectionId: string) => void;
}) {
  const frameWidth = device === "mobile" ? 375 : design.styles.contentWidth;

  return (
    <div
      className="min-h-full px-6 py-8"
      style={{ background: design.styles.pageBackground }}
      onClick={() => onSelect({ type: "email" })}
    >
      <div className="mx-auto" style={{ width: frameWidth, maxWidth: "100%" }}>
        <EmailInboxBar subject={subject} previewText={previewText} width={frameWidth} />
        <div
          className="shadow-sm"
          style={{ background: design.styles.contentBackground }}
          data-testid="email-canvas"
        >
        {design.sections.map((section, sectionIndex) => {
          const sectionSelected =
            selection.type === "section" && selection.sectionId === section.id;
          return (
            <div key={section.id}>
              <SectionDrop
                disabled={readOnly}
                onDrop={(payload) =>
                  onDrop(payload, { beforeSectionId: section.id })
                }
              />
              <section
                className={cn(
                  "relative",
                  sectionSelected && "outline outline-2 outline-[#007DC5]"
                )}
                style={{
                  background: section.background || design.styles.contentBackground,
                  padding: `${section.paddingTop}px ${section.paddingRight}px ${section.paddingBottom}px ${section.paddingLeft}px`,
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect({ type: "section", sectionId: section.id });
                }}
              >
                {!readOnly && sectionSelected ? (
                  <div className="mb-2 flex justify-end gap-1">
                    <IconButton label="Move section up" onClick={() => onMoveSection(section.id, -1)} disabled={sectionIndex === 0}>
                      <ChevronUp className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton label="Move section down" onClick={() => onMoveSection(section.id, 1)} disabled={sectionIndex === design.sections.length - 1}>
                      <ChevronDown className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton label="Duplicate section" onClick={() => onDuplicateSection(section.id)}>
                      <Copy className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton label="Delete section" onClick={() => onDeleteSection(section.id)} disabled={design.sections.length <= 1}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton>
                  </div>
                ) : null}
                <div className={cn("flex", device === "mobile" ? "flex-col gap-4" : "flex-row")} style={{ gap: device === "mobile" ? undefined : section.columnGap }}>
                  {section.columns.map((column) => (
                    <div
                      key={column.id}
                      className="min-h-[48px] flex-1"
                      style={{ width: device === "mobile" ? "100%" : `${column.width}%` }}
                      onDragOver={(event) => {
                        if (!readOnly) event.preventDefault();
                      }}
                      onDrop={(event) => {
                        if (readOnly) return;
                        event.preventDefault();
                        event.stopPropagation();
                        const payload = readDrag(event);
                        if (!payload || payload.source === "section") return;
                        onDrop(payload, {
                          sectionId: section.id,
                          columnId: column.id,
                          beforeBlockId: null,
                        });
                      }}
                    >
                      {column.blocks.length === 0 ? (
                        <div className="rounded border border-dashed border-border px-2 py-6 text-center text-xs text-muted">
                          Drop a block here
                        </div>
                      ) : null}
                      {column.blocks.map((block, blockIndex) => {
                        const selected =
                          selection.type === "block" && selection.blockId === block.id;
                        return (
                          <div
                            key={block.id}
                            className={cn(
                              "relative",
                              selected && "outline outline-2 outline-offset-2 outline-[#007DC5]"
                            )}
                            draggable={!readOnly}
                            onDragStart={(event) => {
                              event.stopPropagation();
                              writeDrag(event, { source: "move", blockId: block.id });
                            }}
                            onDragOver={(event) => {
                              if (!readOnly) event.preventDefault();
                            }}
                            onDrop={(event) => {
                              if (readOnly) return;
                              event.preventDefault();
                              event.stopPropagation();
                              const payload = readDrag(event);
                              if (!payload || payload.source === "section") return;
                              onDrop(payload, {
                                sectionId: section.id,
                                columnId: column.id,
                                beforeBlockId: block.id,
                              });
                            }}
                            onClick={(event) => {
                              event.stopPropagation();
                              onSelect({
                                type: "block",
                                sectionId: section.id,
                                columnId: column.id,
                                blockId: block.id,
                              });
                            }}
                          >
                            {!readOnly && selected ? (
                              <div className="mb-1 flex justify-end gap-1">
                                <span className="inline-flex h-6 w-6 items-center justify-center text-muted" title="Drag to move">
                                  <GripVertical className="h-3.5 w-3.5" />
                                </span>
                                <IconButton label="Move up" onClick={() => onMove(block.id, -1)} disabled={blockIndex === 0}>
                                  <ChevronUp className="h-3.5 w-3.5" />
                                </IconButton>
                                <IconButton label="Move down" onClick={() => onMove(block.id, 1)} disabled={blockIndex === column.blocks.length - 1}>
                                  <ChevronDown className="h-3.5 w-3.5" />
                                </IconButton>
                                <IconButton label="Duplicate" onClick={() => onDuplicate(block.id)}>
                                  <Copy className="h-3.5 w-3.5" />
                                </IconButton>
                                <IconButton label="Delete" onClick={() => onDelete(block.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </IconButton>
                              </div>
                            ) : null}
                            <BlockView
                              block={block}
                              design={design}
                              selected={selected}
                              readOnly={readOnly}
              onLive={(patch) => onLiveBlock(block.id, patch)}
              onCommit={() => onCommitBlock(block.id)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          );
        })}
        <SectionDrop
          disabled={readOnly}
          onDrop={(payload) => onDrop(payload, { beforeSectionId: null })}
        />
      </div>
      </div>
    </div>
  );
}

function SectionDrop({
  disabled,
  onDrop,
}: {
  disabled?: boolean;
  onDrop: (payload: DesignerDrag) => void;
}) {
  if (disabled) return null;
  return (
    <div
      className="h-3"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const payload = readDrag(event);
        if (payload?.source === "section") onDrop(payload);
      }}
    />
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      className="inline-flex h-6 w-6 items-center justify-center rounded border border-border bg-white text-muted hover:text-brand disabled:opacity-40"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

function BlockView({
  block,
  design,
  selected,
  readOnly,
  onLive,
  onCommit,
}: {
  block: EmailBlock;
  design: EmailDesign;
  selected: boolean;
  readOnly?: boolean;
  onLive: (patch: Partial<EmailBlock>) => void;
  onCommit: () => void;
}) {
  const align = block.align;
  const style = {
    paddingTop: block.paddingTop,
    paddingRight: block.paddingRight,
    paddingBottom: block.paddingBottom,
    paddingLeft: block.paddingLeft,
    textAlign: align,
  } as const;

  if (block.type === "heading") {
    if (selected && !readOnly) {
      return (
        <input
          className="w-full bg-transparent font-semibold outline-none"
          style={{
            ...style,
            color: block.color,
            fontSize: block.fontSize,
            fontFamily: design.styles.headingFontFamily,
          }}
          value={block.text}
          onChange={(event) => onLive({ text: event.target.value } as Partial<EmailBlock>)}
          onBlur={() => onCommit()}
          onClick={(event) => event.stopPropagation()}
        />
      );
    }
    return (
      <h2
        style={{
          ...style,
          margin: 0,
          color: block.color,
          fontSize: block.fontSize,
          fontFamily: design.styles.headingFontFamily,
          lineHeight: 1.2,
        }}
      >
        {block.text}
      </h2>
    );
  }

  if (block.type === "text") {
    if (selected && !readOnly) {
      return (
        <div style={style} onClick={(event) => event.stopPropagation()}>
          <RichTextEditor
            value={block.html}
            onChange={(html) => onLive({ html } as Partial<EmailBlock>)}
            onBlur={() => onCommit()}
            minHeight="80px"
          />
        </div>
      );
    }
    return (
      <div
        style={{
          ...style,
          color: block.color,
          fontSize: block.fontSize,
          fontFamily: design.styles.fontFamily,
          lineHeight: 1.5,
        }}
        dangerouslySetInnerHTML={{ __html: sanitizeRichEmailHtml(block.html) }}
      />
    );
  }

  if (block.type === "image" || block.type === "logo") {
    const src = safeEmailUrl(block.src);
    return (
      <div style={style}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={block.alt}
            className="inline-block max-w-full"
            style={{
              width: block.type === "image" ? `${block.widthPercent}%` : block.width,
            }}
          />
        ) : (
          <div className="rounded border border-dashed border-border px-3 py-8 text-sm text-muted">
            {block.type === "logo" ? block.alt || "Peters & May" : "Add an image URL"}
          </div>
        )}
      </div>
    );
  }

  if (block.type === "button") {
    return (
      <div style={style}>
        <span
          className="inline-block px-5 py-3 text-sm font-semibold"
          style={{
            background: block.background,
            color: block.color,
            borderRadius: block.radius,
            width: block.fullWidth ? "100%" : undefined,
          }}
        >
          {block.label || "Button"}
        </span>
      </div>
    );
  }

  if (block.type === "divider") {
    return (
      <div style={style}>
        <hr style={{ border: 0, borderTop: `${block.thickness}px solid ${block.color}` }} />
      </div>
    );
  }

  if (block.type === "spacer") {
    return <div style={{ height: block.height }} />;
  }

  if (block.type === "social") {
    const linked = block.links.filter((link) => link.url.trim());
    return (
      <div style={{ ...style, fontSize: 13 }}>
        {linked.length === 0 ? (
          <span className="text-muted">Add social links</span>
        ) : (
          linked.map((link) => (
            <span key={link.network} className="mr-3 capitalize underline" style={{ color: design.styles.linkColor }}>
              {link.network === "linkedin"
                ? "LinkedIn"
                : link.network === "youtube"
                  ? "YouTube"
                  : link.network}
            </span>
          ))
        )}
      </div>
    );
  }

  if (block.type === "footer") {
    return (
      <div style={{ ...style, fontSize: 12, color: "#666666" }}>
        <div>{block.text}</div>
        <div className="mt-1 underline" style={{ color: design.styles.linkColor }}>
          Unsubscribe
        </div>
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden text-xs"
      style={style}
      dangerouslySetInnerHTML={{ __html: sanitizeHtmlBlock(block.html) || "<p>HTML block</p>" }}
    />
  );
}
