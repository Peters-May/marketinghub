"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Columns2,
  Copy,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import type { EmailBlock, EmailDesign } from "@/lib/email/design";
import { emailImageSrc, sanitizeHtmlBlock, sanitizeRichEmailHtml } from "@/lib/email/design/compile";
import { resolveFooterLinkSettings } from "@/lib/email/footer-links";
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
  const [dropTarget, setDropTargetState] = useState<string | null>(null);
  const [hoverSectionId, setHoverSectionId] = useState<string | null>(null);
  const [hoverBlockId, setHoverBlockId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function setDropTarget(next: string | null) {
    setDropTargetState((current) => (current === next ? current : next));
  }

  return (
    <div
      className="min-h-full px-8 pb-20 pt-10"
      style={{ background: design.styles.pageBackground }}
      onClick={() => onSelect({ type: "email" })}
      onDragStartCapture={() => {
        setDragging(true);
        setHoverSectionId(null);
        setHoverBlockId(null);
      }}
      onDragEndCapture={() => {
        setDragging(false);
        setDropTarget(null);
      }}
      onDropCapture={() => {
        setDragging(false);
        setDropTarget(null);
      }}
    >
      <div className="mx-auto" style={{ width: frameWidth, maxWidth: "100%" }}>
        <EmailInboxBar subject={subject} previewText={previewText} width={frameWidth} />
        <div
          className="overflow-visible shadow-sm"
          style={{ background: design.styles.contentBackground }}
          data-testid="email-canvas"
        >
          {design.sections.map((section, sectionIndex) => {
            const sectionSelected =
              selection.type === "section" && selection.sectionId === section.id;
            const selectedBlockInSection =
              selection.type === "block" && selection.sectionId === section.id
                ? selection.blockId
                : null;
            const sectionHovered = !dragging && hoverSectionId === section.id;
            const moduleHoveredInSection =
              !dragging &&
              hoverBlockId != null &&
              section.columns.some((column) =>
                column.blocks.some((block) => block.id === hoverBlockId)
              );
            /**
             * HubSpot-style: section tools only when the pointer is on the section
             * chrome (not a module), or the section is selected with no module selected.
             * Hover chrome is suppressed while dragging to avoid flash.
             */
            const showSectionTools =
              !readOnly &&
              !dragging &&
              !moduleHoveredInSection &&
              !selectedBlockInSection &&
              (sectionHovered || sectionSelected);
            const showSectionOutline =
              !readOnly &&
              !dragging &&
              (showSectionTools ||
                (sectionHovered && !moduleHoveredInSection) ||
                (sectionSelected && !selectedBlockInSection));
            const showColumnGuides = showSectionTools;
            const columnOrder =
              device === "mobile" && section.mobileStack === "reverse"
                ? [...section.columns].reverse()
                : section.columns;

            return (
              <div key={section.id} className="relative">
                <SectionGap
                  disabled={readOnly}
                  onDropSection={(payload) =>
                    onDrop(payload, { beforeSectionId: section.id })
                  }
                />

                <div
                  className={cn(
                    "relative ml-3",
                    showSectionOutline && "z-[2]"
                  )}
                  onMouseEnter={() => setHoverSectionId(section.id)}
                  onMouseLeave={() => {
                    setHoverSectionId((current) =>
                      current === section.id ? null : current
                    );
                  }}
                >
                  {/* Section left rail + grip — only for section hover/select */}
                  {showSectionOutline ? (
                    <div
                      className="absolute -left-3 bottom-0 top-0 z-20 w-3 rounded-l-sm bg-[#007DC5]"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelect({ type: "section", sectionId: section.id });
                      }}
                    >
                      <span
                        className="absolute left-1/2 top-6 flex h-7 w-5 -translate-x-1/2 items-center justify-center rounded-sm bg-[#5eb8e8] text-white shadow-sm"
                        title="Section"
                      >
                        <GripVertical className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  ) : null}

                  {/* Section action bar — top-left, dark; never with module tools */}
                  {showSectionTools ? (
                    <div
                      className="absolute -top-8 left-0 z-30 flex items-center gap-0.5 rounded-md bg-[#2d3a45] px-1 py-0.5 shadow-md"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <DarkTool
                        label="Move section up"
                        disabled={sectionIndex === 0}
                        onClick={() => onMoveSection(section.id, -1)}
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </DarkTool>
                      <DarkTool
                        label="Move section down"
                        disabled={sectionIndex === design.sections.length - 1}
                        onClick={() => onMoveSection(section.id, 1)}
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </DarkTool>
                      <DarkTool
                        label="Duplicate section"
                        onClick={() => onDuplicateSection(section.id)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </DarkTool>
                      <DarkTool
                        label="Add column"
                        disabled={section.columns.length >= 4}
                        onClick={() => onAddColumn(section.id)}
                      >
                        <Columns2 className="h-3.5 w-3.5" />
                      </DarkTool>
                      <DarkTool
                        label="Delete section"
                        danger
                        disabled={design.sections.length <= 1}
                        onClick={() => onDeleteSection(section.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </DarkTool>
                    </div>
                  ) : null}

                  <section
                    className={cn(
                      "relative transition-[box-shadow]",
                      showSectionOutline &&
                        "shadow-[inset_0_0_0_2px_#007DC5]"
                    )}
                    style={{
                      background:
                        section.background || design.styles.contentBackground,
                      padding: `${section.paddingTop}px ${section.paddingRight}px ${section.paddingBottom}px ${section.paddingLeft}px`,
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect({ type: "section", sectionId: section.id });
                    }}
                  >
                    <div
                      className={cn(
                        "flex",
                        device === "mobile"
                          ? "flex-col gap-3"
                          : "flex-row items-stretch"
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
                      {columnOrder.map((column, columnIndex) => {
                        const columnDropKey = `${section.id}:${column.id}:end`;
                        const originalIndex = section.columns.findIndex(
                          (item) => item.id === column.id
                        );
                        return (
                          <div
                            key={column.id}
                            className={cn(
                              "relative min-h-[64px] min-w-0 flex-1 transition-colors",
                              showColumnGuides &&
                                "rounded-sm outline outline-1 outline-dashed outline-slate-300/80",
                              dropTarget === columnDropKey &&
                                "bg-[#007DC5]/10 outline outline-1 outline-[#007DC5]"
                            )}
                            style={{
                              width:
                                device === "mobile"
                                  ? "100%"
                                  : `${column.width}%`,
                            }}
                            onDragOver={(event) => {
                              if (readOnly) return;
                              event.preventDefault();
                              setDropTarget(columnDropKey);
                            }}
                            onDragLeave={() => {
                              setDropTargetState((current) =>
                                current === columnDropKey ? null : current
                              );
                            }}
                            onDrop={(event) => {
                              if (readOnly) return;
                              event.preventDefault();
                              event.stopPropagation();
                              setDropTarget(null);
                              const payload = readDrag(event);
                              if (!payload || payload.source === "section")
                                return;
                              onDrop(payload, {
                                sectionId: section.id,
                                columnId: column.id,
                                beforeBlockId: null,
                              });
                            }}
                          >
                            {showSectionTools && section.columns.length > 1 ? (
                              <div className="mb-1 flex items-center justify-between gap-1 px-1">
                                <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
                                  Col {originalIndex + 1 || columnIndex + 1} ·{" "}
                                  {column.width}%
                                </span>
                                <button
                                  type="button"
                                  title="Remove column"
                                  className="text-[10px] text-muted hover:text-red-700"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onRemoveColumn(section.id, column.id);
                                  }}
                                >
                                  Remove
                                </button>
                              </div>
                            ) : null}

                            {column.blocks.length === 0 ? (
                              <div className="m-1 flex min-h-[72px] items-center justify-center rounded border border-dashed border-slate-300 bg-slate-50/90 px-2 py-5 text-center text-xs text-muted">
                                Drop a module here
                              </div>
                            ) : null}

                            {column.blocks.map((block, blockIndex) => {
                              const selected =
                                selection.type === "block" &&
                                selection.blockId === block.id;
                              const hovered =
                                !dragging && hoverBlockId === block.id;
                              const showModuleChrome =
                                !readOnly && !dragging && (selected || hovered);
                              const beforeKey = `${section.id}:${column.id}:${block.id}`;
                              return (
                                <div key={block.id} className="relative py-0.5">
                                  <InsertLine
                                    active={dropTarget === beforeKey}
                                    onDragOver={() => setDropTarget(beforeKey)}
                                    onDrop={(payload) => {
                                      setDropTarget(null);
                                      if (payload.source === "section") return;
                                      onDrop(payload, {
                                        sectionId: section.id,
                                        columnId: column.id,
                                        beforeBlockId: block.id,
                                      });
                                    }}
                                    disabled={readOnly}
                                  />
                                  <div
                                    className={cn(
                                      "relative ml-1",
                                      showModuleChrome && "z-[4]"
                                    )}
                                    onMouseEnter={() =>
                                      setHoverBlockId(block.id)
                                    }
                                    onMouseLeave={() => {
                                      setHoverBlockId((current) =>
                                        current === block.id ? null : current
                                      );
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
                                    {showModuleChrome ? (
                                      <>
                                        <span
                                          className="absolute -left-3 top-3 z-30 flex h-7 w-5 cursor-grab items-center justify-center rounded-sm bg-[#007DC5] text-white shadow-sm active:cursor-grabbing"
                                          title="Drag module"
                                          draggable
                                          onDragStart={(event) => {
                                            event.stopPropagation();
                                            writeDrag(event, {
                                              source: "move",
                                              blockId: block.id,
                                            });
                                          }}
                                          onClick={(event) =>
                                            event.stopPropagation()
                                          }
                                        >
                                          <GripVertical className="h-3.5 w-3.5" />
                                        </span>
                                        <div
                                          className="absolute -top-7 right-0 z-30 flex items-center gap-0.5 rounded-md bg-[#2d3a45] px-1 py-0.5 shadow-md"
                                          onClick={(event) =>
                                            event.stopPropagation()
                                          }
                                        >
                                          <DarkTool
                                            label="Move up"
                                            disabled={blockIndex === 0}
                                            onClick={() =>
                                              onMove(block.id, -1)
                                            }
                                          >
                                            <ChevronUp className="h-3.5 w-3.5" />
                                          </DarkTool>
                                          <DarkTool
                                            label="Move down"
                                            disabled={
                                              blockIndex ===
                                              column.blocks.length - 1
                                            }
                                            onClick={() => onMove(block.id, 1)}
                                          >
                                            <ChevronDown className="h-3.5 w-3.5" />
                                          </DarkTool>
                                          <DarkTool
                                            label="Duplicate"
                                            onClick={() =>
                                              onDuplicate(block.id)
                                            }
                                          >
                                            <Copy className="h-3.5 w-3.5" />
                                          </DarkTool>
                                          <DarkTool
                                            label="Delete"
                                            danger
                                            onClick={() => onDelete(block.id)}
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </DarkTool>
                                        </div>
                                      </>
                                    ) : null}
                                    <div
                                      className={cn(
                                        "rounded-sm transition-[box-shadow]",
                                        showModuleChrome &&
                                          "shadow-[inset_0_0_0_2px_#007DC5]"
                                      )}
                                    >
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
                                        onLive={(patch) =>
                                          onLiveBlock(block.id, patch)
                                        }
                                        onCommit={() =>
                                          onCommitBlock(block.id)
                                        }
                                      />
                                    </div>
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

                {!readOnly && showSectionTools ? (
                  <div className="flex justify-center py-1.5">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-full border border-[#007DC5]/40 bg-white px-2.5 py-1 text-[11px] font-medium text-[#007DC5] shadow-sm hover:bg-[#007DC5]/5"
                      onClick={(event) => {
                        event.stopPropagation();
                        onAddSectionAfter(section.id);
                      }}
                    >
                      <Plus className="h-3 w-3" />
                      Add section
                    </button>
                  </div>
                ) : (
                  <div className="h-2" />
                )}
              </div>
            );
          })}

          <SectionGap
            disabled={readOnly}
            trailing
            onDropSection={(payload) =>
              onDrop(payload, { beforeSectionId: null })
            }
            onAddClick={
              design.sections.length > 0
                ? () =>
                    onAddSectionAfter(
                      design.sections[design.sections.length - 1]!.id
                    )
                : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}

function SectionGap({
  disabled,
  trailing,
  onDropSection,
  onAddClick,
}: {
  disabled?: boolean;
  trailing?: boolean;
  onDropSection: (payload: DesignerDrag) => void;
  onAddClick?: () => void;
}) {
  const [active, setActive] = useState(false);
  if (disabled) return <div className={trailing ? "h-2" : "h-0"} />;
  return (
    <div
      className={cn(
        "relative flex items-center justify-center transition-colors",
        trailing ? "h-10" : "h-3",
        active && "bg-[#007DC5]/10"
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
        if (payload?.source === "section") onDropSection(payload);
      }}
    >
      {active ? (
        <span className="rounded bg-[#007DC5] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
          Drop section here
        </span>
      ) : trailing && onAddClick ? (
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border bg-white/90 px-2.5 py-1 text-[11px] text-muted hover:border-[#007DC5] hover:text-brand"
          onClick={(event) => {
            event.stopPropagation();
            onAddClick();
          }}
        >
          <Plus className="h-3 w-3" />
          Add section
        </button>
      ) : (
        <div
          className={cn(
            "h-px w-full max-w-[80%] bg-transparent",
            active && "bg-[#007DC5]"
          )}
        />
      )}
    </div>
  );
}

function InsertLine({
  active,
  disabled,
  onDragOver,
  onDrop,
}: {
  active: boolean;
  disabled?: boolean;
  onDragOver: () => void;
  onDrop: (payload: DesignerDrag) => void;
}) {
  if (disabled) return null;
  return (
    <div
      className={cn(
        "mx-2 flex h-2 items-center justify-center transition-all",
        active ? "h-3" : "hover:h-3"
      )}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDragOver();
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const payload = readDrag(event);
        if (payload) onDrop(payload);
      }}
    >
      <div
        className={cn(
          "h-0.5 w-full rounded-full transition-colors",
          active ? "bg-[#007DC5]" : "bg-transparent"
        )}
      />
    </div>
  );
}

function DarkTool({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded text-white/90 hover:bg-white/15 disabled:opacity-35",
        danger && "hover:bg-red-500/40"
      )}
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

  if (block.type === "video") {
    const thumb = emailImageSrc(block.thumbnailSrc, false);
    return (
      <div style={style}>
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt={block.alt || "Watch video"}
            className="inline-block h-auto max-w-full"
            style={{ width: `${block.widthPercent}%` }}
          />
        ) : (
          <div className="inline-flex min-h-[100px] w-full flex-col items-center justify-center gap-1 rounded border border-dashed border-slate-300 bg-slate-50 px-3 py-6 text-center text-sm text-muted">
            <span className="font-medium text-brand">Add video</span>
            <span className="text-xs">Thumbnail + video URL in the inspector</span>
          </div>
        )}
        {block.videoUrl ? (
          <p className="mt-1 text-xs" style={{ color: design.styles.linkColor }}>
            Watch the video
          </p>
        ) : null}
      </div>
    );
  }

  if (block.type === "quote") {
    return (
      <div
        style={{
          ...style,
          borderLeft: `4px solid ${block.accentColor}`,
          paddingLeft: Math.max(12, block.paddingLeft),
        }}
      >
        <p
          style={{
            margin: 0,
            fontFamily: design.styles.headingFontFamily,
            fontSize: block.fontSize,
            fontWeight: 600,
            color: block.color,
            lineHeight: 1.35,
          }}
        >
          {block.text}
        </p>
        {block.attribution ? (
          <p className="mt-2 text-xs text-muted">— {block.attribution}</p>
        ) : null}
      </div>
    );
  }

  if (block.type === "content_card") {
    const src = emailImageSrc(block.imageSrc, false);
    return (
      <div
        className="rounded border border-border p-3"
        style={style}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="mb-2 h-auto w-full object-cover" />
        ) : (
          <div className="mb-2 flex h-20 items-center justify-center rounded bg-slate-50 text-xs text-muted">
            Card image
          </div>
        )}
        <p
          className="m-0 font-semibold"
          style={{
            fontFamily: design.styles.headingFontFamily,
            color: design.styles.textColor,
            fontSize: 18,
          }}
        >
          {block.title}
        </p>
        <div
          className="email-rich-text mt-1 text-sm"
          dangerouslySetInnerHTML={{
            __html: sanitizeRichEmailHtml(block.bodyHtml),
          }}
        />
        {block.ctaLabel ? (
          <span
            className="mt-2 inline-block px-3 py-1.5 text-xs font-semibold text-white"
            style={{
              background: design.styles.buttonBackground,
              borderRadius: design.styles.buttonRadius,
            }}
          >
            {block.ctaLabel}
          </span>
        ) : null}
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
    const links = resolveFooterLinkSettings(design.styles, block);
    const parts: string[] = [];
    if (links.showUnsubscribe) parts.push(links.unsubscribeLabel);
    if (links.showPreferences) parts.push(links.preferencesLabel);
    return (
      <div style={{ ...style, fontSize: 12, color: "#666666" }}>
        <div className="whitespace-pre-line">{block.text}</div>
        {parts.length > 0 ? (
          <div className="mt-1" style={{ color: design.styles.linkColor }}>
            {parts.map((label, index) => (
              <span key={label}>
                {index > 0 ? <span className="text-muted">{" · "}</span> : null}
                <span className="underline">{label}</span>
              </span>
            ))}
          </div>
        ) : null}
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
