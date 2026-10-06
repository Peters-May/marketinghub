"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Monitor, Redo2, Smartphone, Undo2 } from "lucide-react";
import type { EmailBlock, EmailDesign, EmailSection } from "@/lib/email/design";
import {
  compileEmailDesign,
  createBlock,
  createSection,
  duplicateBlock,
  duplicateSection,
  insertBlock,
  insertSection,
  moveBlock,
  moveBlockBy,
  moveSection,
  removeBlock,
  removeSection,
  resolveEmailDesign,
  setSectionPreset,
  starterDesign,
  updateBlock,
  updateSection,
  type EmailBlockType,
  type SectionPreset,
  type StarterLayout,
} from "@/lib/email/design";
import { previewMerge } from "@/lib/email/design/preview";
import { EmailCanvas, EmailInboxBar, type CanvasSelection } from "@/components/email/builder/EmailCanvas";
import { EmailInspector } from "@/components/email/builder/EmailInspector";
import { EmailPalette } from "@/components/email/builder/EmailPalette";
import type { DesignerDrag } from "@/components/email/builder/drag";
import { cn } from "@/lib/utils";

function sameDesign(a: EmailDesign, b: EmailDesign) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function useDesignHistory(create: () => EmailDesign) {
  const [design, setDesign] = useState(create);
  const designRef = useRef(design);
  const headRef = useRef(design);
  const pastRef = useRef<EmailDesign[]>([]);
  const futureRef = useRef<EmailDesign[]>([]);
  const [, setTick] = useState(0);
  const refresh = () => setTick((n) => n + 1);

  function live(next: EmailDesign) {
    designRef.current = next;
    setDesign(next);
  }

  function commit(next: EmailDesign) {
    const head = headRef.current;
    const current = designRef.current;
    if (sameDesign(next, current) && sameDesign(current, head)) return;
    if (!sameDesign(current, head) && !sameDesign(current, next)) {
      pastRef.current = [...pastRef.current, head, current].slice(-50);
    } else if (!sameDesign(head, next)) {
      pastRef.current = [...pastRef.current, head].slice(-50);
    }
    futureRef.current = [];
    headRef.current = next;
    designRef.current = next;
    setDesign(next);
    refresh();
  }

  function undo() {
    const current = designRef.current;
    const head = headRef.current;
    if (!sameDesign(current, head)) {
      futureRef.current = [current, ...futureRef.current];
      headRef.current = head;
      designRef.current = head;
      setDesign(head);
      refresh();
      return;
    }
    const prev = pastRef.current[pastRef.current.length - 1];
    if (!prev) return;
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [head, ...futureRef.current];
    headRef.current = prev;
    designRef.current = prev;
    setDesign(prev);
    refresh();
  }

  function redo() {
    const next = futureRef.current[0];
    if (!next) return;
    pastRef.current = [...pastRef.current, headRef.current].slice(-50);
    futureRef.current = futureRef.current.slice(1);
    headRef.current = next;
    designRef.current = next;
    setDesign(next);
    refresh();
  }

  const canUndo =
    pastRef.current.length > 0 || !sameDesign(design, headRef.current);
  const canRedo = futureRef.current.length > 0;

  return { design, designRef, live, commit, undo, redo, canUndo, canRedo };
}

export function EmailDesigner({
  kind,
  id,
  readOnly,
  backHref,
  initialName,
  initialSubject,
  initialPreview,
  initialDesign,
  initialHtml,
}: {
  kind: "template" | "campaign";
  id: string;
  readOnly: boolean;
  backHref: string;
  initialName: string;
  initialSubject: string;
  initialPreview: string;
  initialDesign: EmailDesign | null;
  initialHtml: string;
}) {
  const router = useRouter();
  const history = useDesignHistory(() =>
    resolveEmailDesign(initialDesign, initialHtml)
  );
  const [name, setName] = useState(initialName);
  const [subject, setSubject] = useState(initialSubject);
  const [previewText, setPreviewText] = useState(initialPreview);
  const [selection, setSelection] = useState<CanvasSelection>({ type: "email" });
  const [tab, setTab] = useState<"content" | "layouts">("content");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedNote, setSavedNote] = useState("");

  const section =
    selection.type === "email"
      ? null
      : history.design.sections.find((item) => item.id === selection.sectionId) ?? null;
  const block =
    selection.type === "block" && section
      ? section.columns
          .flatMap((column) => column.blocks)
          .find((item) => item.id === selection.blockId) ?? null
      : null;

  function targetForNewBlock(): {
    sectionId: string;
    columnId: string;
    beforeBlockId: string | null;
  } | null {
    const design = history.designRef.current;
    if (selection.type === "block") {
      const found = design.sections.find((item) => item.id === selection.sectionId);
      const column = found?.columns.find((item) => item.id === selection.columnId);
      if (!found || !column) return null;
      const index = column.blocks.findIndex((item) => item.id === selection.blockId);
      return {
        sectionId: found.id,
        columnId: column.id,
        beforeBlockId: column.blocks[index + 1]?.id ?? null,
      };
    }
    const found =
      selection.type === "section"
        ? design.sections.find((item) => item.id === selection.sectionId)
        : design.sections[design.sections.length - 1];
    const column = found?.columns[0];
    if (!found || !column) return null;
    return { sectionId: found.id, columnId: column.id, beforeBlockId: null };
  }

  function addBlock(type: EmailBlockType) {
    if (readOnly) return;
    const target = targetForNewBlock();
    if (!target) return;
    const block = createBlock(type);
    history.commit(
      insertBlock(
        history.designRef.current,
        target.sectionId,
        target.columnId,
        block,
        target.beforeBlockId
      )
    );
    setSelection({
      type: "block",
      sectionId: target.sectionId,
      columnId: target.columnId,
      blockId: block.id,
    });
  }

  function addSection(preset: SectionPreset, beforeSectionId?: string | null) {
    if (readOnly) return;
    const section = createSection(preset);
    const before =
      beforeSectionId !== undefined
        ? beforeSectionId
        : selection.type === "section"
          ? history.design.sections[
              history.design.sections.findIndex((item) => item.id === selection.sectionId) + 1
            ]?.id ?? null
          : null;
    history.commit(insertSection(history.designRef.current, section, before));
    setSelection({ type: "section", sectionId: section.id });
  }

  function onDrop(
    payload: DesignerDrag,
    target:
      | { sectionId: string; columnId: string; beforeBlockId: string | null }
      | { beforeSectionId: string | null }
  ) {
    if (readOnly) return;
    if ("beforeSectionId" in target) {
      if (payload.source !== "section") return;
      addSection(payload.preset, target.beforeSectionId);
      return;
    }
    if (payload.source === "block") {
      const block = createBlock(payload.blockType);
      history.commit(
        insertBlock(
          history.designRef.current,
          target.sectionId,
          target.columnId,
          block,
          target.beforeBlockId
        )
      );
      setSelection({
        type: "block",
        sectionId: target.sectionId,
        columnId: target.columnId,
        blockId: block.id,
      });
      return;
    }
    if (payload.source === "move") {
      if (payload.blockId === target.beforeBlockId) return;
      history.commit(
        moveBlock(history.designRef.current, payload.blockId, target)
      );
    }
  }

  async function save() {
    if (readOnly) return;
    setSaving(true);
    setError("");
    setSavedNote("");
    const design = history.designRef.current;
    const html_body = compileEmailDesign(design);
    const patch =
      kind === "template"
        ? {
            name: name || "Untitled template",
            subject_default: subject,
            preview_text_default: previewText,
            design,
            html_body,
          }
        : {
            title: name || "Untitled campaign",
            subject,
            preview_text: previewText,
            design,
            html_body,
          };
    try {
      const res = await fetch(
        kind === "template" ? "/api/email/templates" : "/api/email/campaigns",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update", id, patch }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setSavedNote("Saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function removeTemplate() {
    if (kind !== "template") return;
    if (!window.confirm("Delete this template?")) return;
    await fetch("/api/email/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    router.push(backHref);
  }

  const compiled = compileEmailDesign(history.design);
  const frameWidth = device === "mobile" ? 375 : history.design.styles.contentWidth;

  return (
    <div className="-mx-4 -mt-6 flex min-h-[calc(100vh-8rem)] flex-col md:-mx-8 md:-mt-8">
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-white px-3 py-2">
        <Link href={backHref} className="btn-secondary px-3 py-1.5 text-sm">
          Back
        </Link>
        <input
          className="input w-40"
          aria-label={kind === "template" ? "Template name" : "Campaign title"}
          value={name}
          disabled={readOnly}
          onChange={(event) => setName(event.target.value)}
        />
        <input
          className="input min-w-[12rem] flex-1"
          aria-label="Subject"
          placeholder="Subject"
          value={subject}
          disabled={readOnly}
          onChange={(event) => setSubject(event.target.value)}
        />
        <input
          className="input hidden min-w-[10rem] flex-1 lg:block"
          aria-label="Preview text"
          placeholder="Preview text"
          value={previewText}
          disabled={readOnly}
          onChange={(event) => setPreviewText(event.target.value)}
        />
        <button
          type="button"
          className="btn-secondary px-2 py-1.5"
          aria-label="Undo"
          disabled={!history.canUndo || readOnly}
          onClick={history.undo}
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="btn-secondary px-2 py-1.5"
          aria-label="Redo"
          disabled={!history.canRedo || readOnly}
          onClick={history.redo}
        >
          <Redo2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={cn("btn-secondary px-2 py-1.5", device === "desktop" && "ring-1 ring-brand")}
          aria-label="Desktop"
          onClick={() => setDevice("desktop")}
        >
          <Monitor className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={cn("btn-secondary px-2 py-1.5", device === "mobile" && "ring-1 ring-brand")}
          aria-label="Mobile"
          onClick={() => setDevice("mobile")}
        >
          <Smartphone className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="btn-secondary px-3 py-1.5 text-sm"
          onClick={() => setPreviewing((value) => !value)}
        >
          {previewing ? "Edit" : "Preview"}
        </button>
        {readOnly ? (
          <span className="text-sm text-muted">Sent — view only</span>
        ) : (
          <button
            type="button"
            className="btn-primary px-3 py-1.5 text-sm"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        )}
        {kind === "template" && !readOnly ? (
          <button
            type="button"
            className="btn-secondary px-3 py-1.5 text-sm text-red-700"
            onClick={() => void removeTemplate()}
          >
            Delete
          </button>
        ) : null}
      </header>
      {error ? (
        <p className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {savedNote ? (
        <p className="border-b border-border bg-slate-50 px-4 py-1 text-xs text-muted">
          {savedNote}
        </p>
      ) : null}
      <div className="flex min-h-0 flex-1">
        <EmailPalette
          tab={tab}
          onTab={setTab}
          disabled={readOnly}
          onAddBlock={addBlock}
          onAddSection={(preset) => addSection(preset)}
          onStarter={(layout: StarterLayout) => {
            if (readOnly) return;
            if (!window.confirm("Replace the current email layout?")) return;
            history.commit(starterDesign(layout));
            setSelection({ type: "email" });
          }}
        />
        <div className="min-w-0 flex-1 overflow-auto">
          {previewing ? (
            <div
              className="min-h-full px-6 py-8"
              style={{ background: history.design.styles.pageBackground }}
            >
              <EmailInboxBar
                subject={subject}
                previewText={previewText}
                width={frameWidth}
              />
              <iframe
                title="Email preview"
                sandbox=""
                className="mx-auto block border border-border bg-white"
                style={{ width: frameWidth, maxWidth: "100%", height: 720 }}
                srcDoc={previewMerge(compiled)}
              />
            </div>
          ) : (
            <EmailCanvas
              design={history.design}
              selection={selection}
              device={device}
              subject={subject}
              previewText={previewText}
              readOnly={readOnly}
              onSelect={setSelection}
              onLiveBlock={(blockId, patch) =>
                history.live(updateBlock(history.designRef.current, blockId, patch))
              }
              onCommitBlock={() => history.commit(history.designRef.current)}
              onDrop={onDrop}
              onMove={(blockId, direction) =>
                history.commit(moveBlockBy(history.designRef.current, blockId, direction))
              }
              onDuplicate={(blockId) =>
                history.commit(duplicateBlock(history.designRef.current, blockId))
              }
              onDelete={(blockId) => {
                history.commit(removeBlock(history.designRef.current, blockId));
                setSelection({ type: "email" });
              }}
              onMoveSection={(sectionId, direction) =>
                history.commit(moveSection(history.designRef.current, sectionId, direction))
              }
              onDuplicateSection={(sectionId) =>
                history.commit(duplicateSection(history.designRef.current, sectionId))
              }
              onDeleteSection={(sectionId) => {
                history.commit(removeSection(history.designRef.current, sectionId));
                setSelection({ type: "email" });
              }}
            />
          )}
        </div>
        <EmailInspector
          design={history.design}
          section={section}
          block={block}
          disabled={readOnly}
          onDesign={(patch) =>
            history.commit({
              ...history.designRef.current,
              styles: { ...history.designRef.current.styles, ...patch },
            })
          }
          onSection={(patch: Partial<EmailSection>) => {
            if (!section) return;
            history.commit(updateSection(history.designRef.current, section.id, patch));
          }}
          onPreset={(preset) => {
            if (!section) return;
            history.commit(setSectionPreset(history.designRef.current, section.id, preset));
          }}
          onBlock={(patch: Partial<EmailBlock>) => {
            if (!block) return;
            history.commit(updateBlock(history.designRef.current, block.id, patch));
          }}
        />
      </div>
    </div>
  );
}
