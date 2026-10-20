"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Columns2,
  Copy,
  GripVertical,
  Minus,
  Plus,
  Trash2,
} from "lucide-react";
import type { EmailBlock, EmailDesign } from "@/lib/email/design";
import { emailImageSrc, sanitizeHtmlBlock, sanitizeRichEmailHtml } from "@/lib/email/design/compile";
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
  insertRequest,
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
  onAddSectionAfter,
  onAddColumn,
  onRemoveColumn,
}: {
  design: EmailDesign;
  selection: CanvasSelection;
  device: "desktop" | "mobile";
  subject: string;
  previewText: string;
  readOnly?: boolean;
  insertRequest?: { token: string; nonce: number } | null;
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
  onAddSectionAfter: (sectionId: string) => void;
  onAddColumn: (sectionId: string) => void;
  onRemoveColumn: (sectionId: string, columnId: string) => void;
}) {
  const frameWidth = device === "mobile" ? 375 : design.styles.contentWidth;
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  return (
    <div
      className="min-h-full px-6 pb-16 pt-8"
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
          const blockInSection =
            selection.type === "block" && selection.sectionId === section.id;
          const showHandles = !readOnly && (sectionSelected || blockInSection);
          const columnOrder =
            device === "mobile" && section.mobileStack === "reverse"
              ? [...section.columns].reverse()
              : section.columns;
          return (
            <div key={section.id} className="relative">
              <SectionDrop
                disabled={readOnly}
                onDrop={(payload) =>
                  onDrop(payload, { beforeSectionId: section.id })
                }
              />
              <section
                className={cn(
                  "relative",
                  (sectionSelected || blockInSection) &&
                    "outline outline-2 outline-[#007DC5]"
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
                {showHandles ? (
                  <>
                    <div className="absolute -top-3 left-1/2 z-10 flex -translate-x-1/2 gap-1">
                      <RoundHandle
                        label="Add new column"
                        disabled={section.columns.length >= 4}
                        onClick={() => onAddColumn(section.id)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </RoundHandle>
                    </div>
                    <div className="absolute -right-3 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-1">
                      <RoundHandle
                        label="Add section below"
                        onClick={() => onAddSectionAfter(section.id)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </RoundHandle>
                      <RoundHandle
                        label="Delete section"
                        disabled={design.sections.length <= 1}
                        onClick={() => onDeleteSection(section.id)}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </RoundHandle>
                    </div>
                    <div className="mb-2 flex flex-wrap justify-end gap-1">
                      <IconButton label="Move section up" onClick={() => onMoveSection(section.id, -1)} disabled={sectionIndex === 0}>
                        <ChevronUp className="h-3.5 w-3.5" />
                      </IconButton>
                      <IconButton label="Move section down" onClick={() => onMoveSection(section.id, 1)} disabled={sectionIndex === design.sections.length - 1}>
                        <ChevronDown className="h-3.5 w-3.5" />
                      </IconButton>
                      <IconButton label="Duplicate section" onClick={() => onDuplicateSection(section.id)}>
                        <Copy className="h-3.5 w-3.5" />
                      </IconButton>
                      <IconButton
                        label="Add column"
                        disabled={section.columns.length >= 4}
                        onClick={() => onAddColumn(section.id)}
                      >
                        <Columns2 className="h-3.5 w-3.5" />
                      </IconButton>
                    </div>
                  </>
                ) : null}
                <div
                  className={cn(
                    "flex",
                    device === "mobile" ? "flex-col gap-4" : "flex-row items-stretch"
                  )}
                  style={{
                    gap: device === "mobile" ? undefined : section.columnGap,
                    alignItems:
                      section.verticalAlign === "middle"
                        ? "center"
                        : section.verticalAlign === "bottom"
                          ? "flex-end"
                          : "flex-start",
                  }}
                >
                  {columnOrder.map((column) => {
                    const columnDropKey = `${section.id}:${column.id}:end`;
                    return (
                    <div
                      key={column.id}
                      className={cn(
                        "relative min-h-[72px] min-w-0 flex-1 rounded transition-colors",
                        dropTarget === columnDropKey && "bg-[#007DC5]/10 ring-1 ring-[#007DC5]"
                      )}
                      style={{ width: device === "mobile" ? "100%" : `${column.width}%` }}
                      onDragOver={(event) => {
                        if (readOnly) return;
                        event.preventDefault();
                        setDropTarget(columnDropKey);
                      }}
                      onDragLeave={() => {
                        setDropTarget((current) =>
                          current === columnDropKey ? null : current
                        );
                      }}
                      onDrop={(event) => {
                        if (readOnly) return;
                        event.preventDefault();
                        event.stopPropagation();
                        setDropTarget(null);
                        const payload = readDrag(event);
                        if (!payload || payload.source === "section") return;
                        onDrop(payload, {
                          sectionId: section.id,
                          columnId: column.id,
                          beforeBlockId: null,
                        });
                      }}
                    >
                      {showHandles && section.columns.length > 1 ? (
                        <button
                          type="button"
                          title="Remove column"
                          className="absolute -right-1 -top-1 z-10 inline-flex h-5 w-5 items-center justify-center rounded-full border border-border bg-white text-muted shadow-sm hover:text-red-700"
                          onClick={(event) => {
                            event.stopPropagation();
                            onRemoveColumn(section.id, column.id);
                          }}
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                      ) : null}
                      {column.blocks.length === 0 ? (
                        <div className="flex min-h-[88px] items-center justify-center rounded border border-dashed border-slate-300 bg-slate-50/80 px-2 py-6 text-center text-xs text-muted">
                          Drop content here
                        </div>
                      ) : null}
                      {column.blocks.map((block, blockIndex) => {
                        const selected =
                          selection.type === "block" && selection.blockId === block.id;
                        const beforeKey = `${section.id}:${column.id}:${block.id}`;
                        return (
                          <div key={block.id} className="relative">
                            <div
                              className={cn(
                                "mx-1 h-1 rounded transition-colors",
                                dropTarget === beforeKey
                                  ? "bg-[#007DC5]"
                                  : "bg-transparent"
                              )}
                              onDragOver={(event) => {
                                if (readOnly) return;
                                event.preventDefault();
                                event.stopPropagation();
                                setDropTarget(beforeKey);
                              }}
                              onDrop={(event) => {
                                if (readOnly) return;
                                event.preventDefault();
                                event.stopPropagation();
                                setDropTarget(null);
                                const payload = readDrag(event);
                                if (!payload || payload.source === "section") return;
                                onDrop(payload, {
                                  sectionId: section.id,
                                  columnId: column.id,
                                  beforeBlockId: block.id,
                                });
                              }}
                            />
                          <div
                            className={cn(
                              "relative",
                              selected && "outline outline-2 outline-offset-2 outline-[#007DC5]"
                            )}
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
                                <span
                                  className="inline-flex h-6 w-6 cursor-grab items-center justify-center text-muted active:cursor-grabbing"
                                  title="Drag to move"
                                  draggable
                                  onDragStart={(event) => {
                                    event.stopPropagation();
                                    writeDrag(event, {
                                      source: "move",
                                      blockId: block.id,
                                    });
                                  }}
                                >
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
                              insertRequest={
                                selected && block.type === "text"
                                  ? insertRequest
                                  : null
                              }
                              onLive={(patch) => onLiveBlock(block.id, patch)}
                              onCommit={() => onCommitBlock(block.id)}
                            />
                          </div>
                          </div>
                        );
                      })}
                    </div>
                    );
                  })}
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
  const [active, setActive] = useState(false);
  if (disabled) return null;
  return (
    <div
      className={cn(
        "my-1 flex h-6 items-center justify-center rounded border border-dashed transition-colors",
        active
          ? "border-[#007DC5] bg-[#007DC5]/10"
          : "border-transparent hover:border-border"
      )}
      onDragOver={(event) => {
        event.preventDefault();
        setActive(true);
      }}
      onDragLeave={() => setActive(false)}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setActive(false);
        const payload = readDrag(event);
        if (payload?.source === "section") onDrop(payload);
      }}
    >
      {active ? (
        <span className="text-[10px] uppercase tracking-wide text-[#007DC5]">
          Drop section
        </span>
      ) : null}
    </div>
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

function RoundHandle({
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
      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#007DC5] bg-white text-[#007DC5] shadow-sm hover:bg-[#007DC5] hover:text-white disabled:opacity-40"
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
  insertRequest,
  onLive,
  onCommit,
}: {
  block: EmailBlock;
  design: EmailDesign;
  selected: boolean;
  readOnly?: boolean;
  insertRequest?: { token: string; nonce: number } | null;
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
    const Tag = block.level === 3 ? "h3" : block.level === 2 ? "h2" : "h1";
    return (
      <Tag
        style={{
          ...style,
          margin: 0,
          color: block.color,
          fontSize: block.fontSize,
          fontFamily: design.styles.headingFontFamily,
          lineHeight: 1.2,
          fontWeight: 600,
        }}
      >
        {block.text}
      </Tag>
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
            variant="email"
            insertRequest={insertRequest}
            textStyle={{
              color: block.color,
              fontSize: block.fontSize,
              fontFamily: design.styles.fontFamily,
              lineHeight: 1.5,
            }}
          />
        </div>
      );
    }
    return (
      <div
        className="email-rich-text"
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
    const src = emailImageSrc(block.src, false);
    const frame =
      block.type === "image" ? `${block.widthPercent}%` : block.width;
    return (
      <div style={style}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={block.alt}
            className="inline-block h-auto max-w-full"
            style={{ width: frame }}
          />
        ) : (
          <div
            className="inline-flex min-h-[120px] w-full flex-col items-center justify-center gap-2 rounded border border-dashed border-slate-300 bg-slate-50 px-3 py-8 text-center text-sm text-muted"
            style={{ width: frame, maxWidth: "100%" }}
          >
            <span className="font-medium text-brand">
              {block.type === "logo" ? "Add logo" : "Add image"}
            </span>
            <span className="text-xs">
              {block.type === "logo"
                ? "Choose a logo in the inspector on the right"
                : "Upload or pick from the gallery in the inspector"}
            </span>
          </div>
        )}
      </div>
    );
  }

  if (block.type === "button") {
    const buttonStyle = {
      background: block.background,
      color: block.color,
      borderRadius: block.radius,
      width: block.fullWidth ? "100%" : undefined,
      fontSize: block.fontSize ?? 16,
      padding: `${block.paddingY ?? 14}px ${block.paddingX ?? 22}px`,
      border:
        (block.borderWidth ?? 0) > 0 && block.borderColor
          ? `${block.borderWidth}px solid ${block.borderColor}`
          : "0",
    } as const;
    if (selected && !readOnly) {
      return (
        <div style={style} onClick={(event) => event.stopPropagation()}>
          <input
            className="inline-block bg-transparent text-center font-semibold outline-none"
            style={buttonStyle}
            value={block.label}
            onChange={(event) =>
              onLive({ label: event.target.value } as Partial<EmailBlock>)
            }
            onBlur={() => onCommit()}
          />
        </div>
      );
    }
    return (
      <div style={style}>
        <span className="inline-block font-semibold" style={buttonStyle}>
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
    const label = (network: string) =>
      network === "linkedin"
        ? "LinkedIn"
        : network === "youtube"
          ? "YouTube"
          : network === "instagram"
            ? "Instagram"
            : network === "facebook"
              ? "Facebook"
              : network;
    return (
      <div style={{ ...style, fontSize: 13 }}>
        {linked.length === 0 ? (
          <span className="text-muted">Add social links</span>
        ) : (
          linked.map((link) => (
            <span
              key={link.network}
              className="mr-3 underline"
              style={{ color: design.styles.linkColor }}
            >
              {label(link.network)}
            </span>
          ))
        )}
      </div>
    );
  }

  if (block.type === "footer") {
    return (
      <div style={{ ...style, fontSize: 12, color: "#666666" }}>
        <div className="whitespace-pre-line">{block.text}</div>
        <div className="mt-1" style={{ color: design.styles.linkColor }}>
          <span className="underline">Unsubscribe</span>
          {block.showPreferences !== false ? (
            <>
              {" · "}
              <span className="underline">Manage preferences</span>
            </>
          ) : null}
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
