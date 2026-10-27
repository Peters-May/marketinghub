"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Monitor, Redo2, Smartphone, Sparkles, Undo2 } from "lucide-react";
import type { EmailBlock, EmailDesign, EmailSection } from "@/lib/email/design";
import {
  addColumn,
  compileEmailDesign,
  createBlock,
  createSection,
  duplicateBlock,
  duplicateSection,
  findBlock,
  insertBlock,
  insertSection,
  moveBlock,
  moveBlockBy,
  moveSection,
  removeBlock,
  removeColumn,
  removeSection,
  resolveEmailDesign,
  setColumnWidths,
  setSectionPreset,
  updateBlock,
  updateSection,
  type EmailBlockType,
  type SectionPreset,
} from "@/lib/email/design";
import { excerptFromDesign } from "@/lib/email/design-excerpt";
import { previewMerge } from "@/lib/email/design/preview";
import { formatLondonStamp, londonDateTimeToIso } from "@/lib/email/display";
import {
  footerLinksFromEmailSettings,
} from "@/lib/email/email-settings";
import type { FooterLinkSettings } from "@/lib/email/footer-links";
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
  audiences = [],
  initialFromName = "Peters & May Marketing",
  initialFromEmail = "hello@petersandmay.com",
  initialAudienceId = "",
  initialExcludeAudienceId = "",
  initialBrief = "",
  canDelete = false,
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
  audiences?: { id: string; name: string }[];
  initialFromName?: string;
  initialFromEmail?: string;
  initialAudienceId?: string;
  initialExcludeAudienceId?: string;
  initialBrief?: string;
  /** Unsent drafts only. Scheduled and sent emails cannot be deleted. */
  canDelete?: boolean;
}) {
  const router = useRouter();
  const history = useDesignHistory(() =>
    resolveEmailDesign(initialDesign, initialHtml)
  );
  const [name, setName] = useState(initialName);
  const [subject, setSubject] = useState(initialSubject);
  const [previewText, setPreviewText] = useState(initialPreview);
  const [brief, setBrief] = useState(initialBrief);
  const [fromName, setFromName] = useState(initialFromName);
  const [fromEmail, setFromEmail] = useState(initialFromEmail);
  const [audienceId, setAudienceId] = useState(initialAudienceId);
  const [excludeAudienceId, setExcludeAudienceId] = useState(
    initialExcludeAudienceId
  );
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [previewMenu, setPreviewMenu] = useState(false);
  const [whenMode, setWhenMode] = useState<"now" | "later">("later");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [sending, setSending] = useState(false);
  const [selection, setSelection] = useState<CanvasSelection>({ type: "email" });
  const [tab, setTab] = useState<"content" | "layouts">("content");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedNote, setSavedNote] = useState("");
  const [dirty, setDirty] = useState(false);
  const [insertRequest, setInsertRequest] = useState<{
    token: string;
    nonce: number;
  } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [subjectSuggestions, setSubjectSuggestions] = useState<
    { subject: string; preview: string }[]
  >([]);
  const [previewSuggestions, setPreviewSuggestions] = useState<string[]>([]);
  const saveRef = useRef<() => Promise<boolean>>(async () => false);
  const dirtyRef = useRef(false);

  const [audienceOptions, setAudienceOptions] = useState(audiences);
  const [footerLinks, setFooterLinks] = useState<FooterLinkSettings | null>(
    null
  );

  useEffect(() => {
    setAudienceOptions(audiences);
  }, [audiences]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/email/settings")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data.settings) return;
        setFooterLinks(footerLinksFromEmailSettings(data.settings));
      })
      .catch(() => {
        /* design styles remain fallback */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (kind !== "campaign" || readOnly) return;
    let cancelled = false;
    void fetch("/api/email/audiences")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !Array.isArray(data.audiences)) return;
        setAudienceOptions(
          data.audiences.map((row: { id: string; name: string }) => ({
            id: row.id,
            name: row.name,
          }))
        );
      })
      .catch(() => {
        /* keep SSR list */
      });
    return () => {
      cancelled = true;
    };
  }, [kind, readOnly]);

  useEffect(() => {
    if (kind !== "campaign" || !audienceId) {
      setRecipientCount(null);
      return;
    }
    let cancelled = false;
    void fetch("/api/email/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "preview_recipients",
        id,
        audience_id: audienceId,
        exclude_audience_id: excludeAudienceId || null,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setRecipientCount(typeof data.count === "number" ? data.count : null);
        }
      })
      .catch(() => {
        if (!cancelled) setRecipientCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [audienceId, excludeAudienceId, id, kind]);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    setDirty(true);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (readOnly) return;
      const target = event.target as HTMLElement | null;
      const editing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        history.undo();
        markDirty();
        return;
      }
      if (
        mod &&
        (event.key.toLowerCase() === "y" ||
          (event.key.toLowerCase() === "z" && event.shiftKey))
      ) {
        event.preventDefault();
        history.redo();
        markDirty();
        return;
      }
      if (event.key === "Escape") {
        setSelection({ type: "email" });
        return;
      }
      if (
        !editing &&
        (event.key === "Delete" || event.key === "Backspace") &&
        selection.type === "block"
      ) {
        event.preventDefault();
        history.commit(removeBlock(history.designRef.current, selection.blockId));
        setSelection({ type: "email" });
        markDirty();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [history, markDirty, readOnly, selection]);

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current || readOnly) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [readOnly]);

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
    markDirty();
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
    markDirty();
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
    if (readOnly) return false;
    setSaving(true);
    setError("");
    setSavedNote("");
    const design = history.designRef.current;
    const html_body = compileEmailDesign(design, { footerLinks });
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
            title: name || "Untitled email",
            subject,
            preview_text: previewText,
            from_name: fromName,
            from_email: fromEmail,
            audience_id: audienceId || null,
            exclude_audience_id: excludeAudienceId || null,
            brief,
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
      dirtyRef.current = false;
      setDirty(false);
      setSavedNote("Saved");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      return false;
    } finally {
      setSaving(false);
    }
  }

  saveRef.current = save;

  useEffect(() => {
    if (readOnly || !dirty) return;
    const timer = window.setTimeout(() => {
      void saveRef.current();
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [
    dirty,
    history.design,
    name,
    subject,
    previewText,
    brief,
    fromName,
    fromEmail,
    audienceId,
    excludeAudienceId,
    readOnly,
  ]);

  async function runAi(action: string, body: Record<string, unknown>) {
    setAiBusy(true);
    setError("");
    try {
      const res = await fetch("/api/email/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI assist failed");
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI assist failed");
      return null;
    } finally {
      setAiBusy(false);
    }
  }

  async function suggestSubjectsAi() {
    const data = await runAi("subjects", {
      brief,
      excerpt: excerptFromDesign(history.designRef.current),
    });
    if (data?.options) {
      setSubjectSuggestions(data.options);
      setPreviewSuggestions([]);
    }
  }

  async function improvePreviewAi() {
    const data = await runAi("preview", {
      subject,
      excerpt: excerptFromDesign(history.designRef.current),
    });
    if (data?.options) {
      setPreviewSuggestions(data.options);
      setSubjectSuggestions([]);
    }
  }

  async function rewriteSelection(
    tone: "clearer" | "shorter" | "more_formal"
  ) {
    if (!block) return;
    if (block.type === "heading") {
      const data = await runAi("rewrite", {
        text: block.text,
        html: false,
        tone,
      });
      if (typeof data?.text === "string") {
        history.commit(
          updateBlock(history.designRef.current, block.id, {
            text: data.text,
          } as Partial<EmailBlock>)
        );
        markDirty();
      }
      return;
    }
    if (block.type === "text") {
      const data = await runAi("rewrite", {
        text: block.html,
        html: true,
        tone,
      });
      if (typeof data?.text === "string") {
        history.commit(
          updateBlock(history.designRef.current, block.id, {
            html: data.text,
          } as Partial<EmailBlock>)
        );
        markDirty();
      }
    }
  }

  async function draftFromBriefAi() {
    const prompt = (brief || subject || name).trim();
    if (!prompt) {
      setError("Add a brief (or a subject) first, then try Draft from brief.");
      return;
    }
    const audienceLabel =
      audienceOptions.find((audience) => audience.id === audienceId)?.name ?? "";
    const data = await runAi("draft_from_brief", {
      brief: prompt,
      audience: audienceLabel,
    });
    const draft = data?.draft as
      | {
          subject?: string;
          preview?: string;
          heading?: string;
          html?: string;
          buttonLabel?: string;
          blocks?: Array<
            | { type: "heading"; text: string }
            | { type: "text"; html: string }
            | { type: "quote"; text: string; attribution?: string }
            | { type: "button"; label: string }
          >;
        }
      | undefined;
    if (!draft) return;
    const design = history.designRef.current;
    // Prefer the first content section (skip brand header/footer when marked locked).
    const targetSection =
      design.sections.find(
        (item) => !(item as { locked?: boolean }).locked
      ) ?? design.sections[0];
    const sectionId = targetSection?.id;
    const columnId = targetSection?.columns[0]?.id;
    if (!sectionId || !columnId) {
      setError("Could not add the draft — this email has no editable section.");
      return;
    }
    let next = design;
    const blocks =
      draft.blocks && draft.blocks.length > 0
        ? draft.blocks
        : [
            draft.heading
              ? ({ type: "heading" as const, text: draft.heading })
              : null,
            draft.html ? ({ type: "text" as const, html: draft.html }) : null,
            draft.buttonLabel
              ? ({ type: "button" as const, label: draft.buttonLabel })
              : null,
          ].filter(Boolean) as NonNullable<typeof draft.blocks>;
    for (const item of blocks) {
      if (item.type === "heading") {
        next = insertBlock(
          next,
          sectionId,
          columnId,
          createBlock("heading", { text: item.text }),
          null
        );
      } else if (item.type === "text") {
        next = insertBlock(
          next,
          sectionId,
          columnId,
          createBlock("text", { html: item.html }),
          null
        );
      } else if (item.type === "quote") {
        next = insertBlock(
          next,
          sectionId,
          columnId,
          createBlock("quote", {
            text: item.text,
            attribution: item.attribution || "",
          }),
          null
        );
      } else if (item.type === "button") {
        next = insertBlock(
          next,
          sectionId,
          columnId,
          createBlock("button", { label: item.label }),
          null
        );
      }
    }
    if (draft.subject) setSubject(draft.subject);
    if (draft.preview) setPreviewText(draft.preview);
    history.commit(next);
    markDirty();
    setSavedNote("AI draft added — review before sending");
  }

  function insertMergeToken(token: string) {
    if (!block) return;
    if (block.type === "text") {
      setInsertRequest({ token, nonce: Date.now() });
      markDirty();
      return;
    }
    if (block.type === "heading") {
      history.commit(
        updateBlock(history.designRef.current, block.id, {
          text: `${block.text}${block.text ? " " : ""}${token}`,
        } as Partial<EmailBlock>)
      );
      markDirty();
    }
  }

  async function copyEmail() {
    setError("");
    if (!readOnly) {
      const saved = await save();
      if (!saved) return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        kind === "template" ? "/api/email/templates" : "/api/email/campaigns",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "clone", id }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not copy this email");
      router.push(`/app/email/design/${kind}/${data.item.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not copy this email");
      setSaving(false);
    }
  }

  async function scheduleSend() {
    if (kind !== "campaign" || readOnly) return;
    const iso = londonDateTimeToIso(scheduleDate, scheduleTime);
    if (!iso) {
      setError("Choose a date and time");
      return;
    }
    if (new Date(iso).getTime() <= Date.now()) {
      setError("Choose a time in the future");
      return;
    }
    setSending(true);
    setError("");
    try {
      const saved = await save();
      if (!saved) return;
      const res = await fetch("/api/email/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "schedule",
          id,
          scheduled_at: iso,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Schedule failed");
      setReviewOpen(false);
      router.push(backHref);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Schedule failed");
    } finally {
      setSending(false);
    }
  }

  async function sendTest() {
    if (kind !== "campaign" || readOnly) return;
    setPreviewMenu(false);
    setSending(true);
    setError("");
    setSavedNote("");
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          test: true,
          from_name: fromName,
          from_email: fromEmail,
          subject,
          html_body: compileEmailDesign(history.designRef.current, {
            footerLinks,
          }),
          campaign_id: id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Test send failed");
      setSavedNote(data.to ? `Test sent to ${data.to}` : "Test sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test send failed");
    } finally {
      setSending(false);
    }
  }

  async function copyLink() {
    setPreviewMenu(false);
    try {
      await navigator.clipboard.writeText(window.location.href);
      setSavedNote("Link copied");
    } catch {
      setError("Could not copy the link");
    }
  }

  async function sendNow() {
    if (kind !== "campaign" || readOnly) return;
    if (!window.confirm("Send this email now to the selected audience?")) return;
    setSending(true);
    setError("");
    try {
      const saved = await save();
      if (!saved) return;
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_id: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Send failed");
      setReviewOpen(false);
      router.push(`/app/email/campaign/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
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

  async function removeDraft() {
    if (kind !== "campaign" || !canDelete || readOnly) return;
    if (!window.confirm("Delete this draft? It has not been sent.")) return;
    setError("");
    try {
      const res = await fetch("/api/email/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not delete this email");
      router.push(backHref);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this email");
    }
  }

  const compiled = compileEmailDesign(history.design, { footerLinks });
  const frameWidth = device === "mobile" ? 375 : history.design.styles.contentWidth;
  const audienceName =
    audienceOptions.find((audience) => audience.id === audienceId)?.name ?? "";
  const excludeAudienceName =
    audienceOptions.find((audience) => audience.id === excludeAudienceId)
      ?.name ?? "";
  const plannedIso =
    whenMode === "later" ? londonDateTimeToIso(scheduleDate, scheduleTime) : null;

  function commitDesign(next: EmailDesign) {
    history.commit(next);
    markDirty();
  }

  function sectionIsBrandLocked(sectionId: string) {
    const design = history.designRef.current;
    if (!design.styles.brandLocked) return false;
    return design.sections.some(
      (item) => item.id === sectionId && item.locked
    );
  }

  return (
    <div className="-mx-4 -mt-6 flex min-h-[calc(100dvh-8rem)] flex-col md:-mx-8 md:-mt-8">
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-white px-3 py-2">
        <Link href={backHref} className="btn-secondary px-3 py-1.5 text-sm">
          Back
        </Link>
        <input
          className="input min-w-[12rem] flex-1"
          aria-label={kind === "template" ? "Template name" : "Email name"}
          value={name}
          disabled={readOnly}
          onChange={(event) => {
            setName(event.target.value);
            markDirty();
          }}
        />
        <button
          type="button"
          className="btn-secondary px-2 py-1.5"
          aria-label="Undo"
          disabled={!history.canUndo || readOnly}
          onClick={() => {
            history.undo();
            markDirty();
          }}
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="btn-secondary px-2 py-1.5"
          aria-label="Redo"
          disabled={!history.canRedo || readOnly}
          onClick={() => {
            history.redo();
            markDirty();
          }}
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
        <div className="relative">
          <button
            type="button"
            className="btn-secondary px-3 py-1.5 text-sm"
            onClick={() => setPreviewMenu((open) => !open)}
          >
            Preview and test
          </button>
          {previewMenu ? (
            <div className="absolute right-0 z-20 mt-2 w-52 rounded-xl border border-border bg-white py-1 shadow-lg">
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                onClick={() => {
                  setPreviewMenu(false);
                  setPreviewing((value) => !value);
                }}
              >
                {previewing ? "Back to edit" : "Preview"}
              </button>
              {kind === "campaign" && !readOnly ? (
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                  disabled={sending}
                  onClick={() => void sendTest()}
                >
                  Send test email
                </button>
              ) : null}
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                onClick={() => void copyLink()}
              >
                Copy link
              </button>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="btn-secondary px-3 py-1.5 text-sm"
          disabled={saving || sending}
          onClick={() => void copyEmail()}
        >
          Copy
        </button>
        {readOnly ? (
          <span className="text-sm text-muted">Sent — view only</span>
        ) : (
          <>
            <button
              type="button"
              className="btn-secondary px-3 py-1.5 text-sm"
              disabled={saving || sending}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {kind === "campaign" ? (
              <button
                type="button"
                className="btn-primary px-3 py-1.5 text-sm"
                onClick={() => {
                  setPreviewMenu(false);
                  setReviewOpen(true);
                }}
              >
                Review and schedule
              </button>
            ) : null}
          </>
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
        {kind === "campaign" && canDelete && !readOnly ? (
          <button
            type="button"
            className="btn-secondary px-3 py-1.5 text-sm text-red-700"
            disabled={saving || sending}
            onClick={() => void removeDraft()}
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
      <div className="border-b border-border bg-white px-4 py-3 text-sm">
        <div className="mx-auto grid max-w-3xl gap-2">
          {kind === "campaign" ? (
            <>
              <label className="grid items-center gap-2 sm:grid-cols-[7rem_1fr]">
                <span className="text-muted">Send to</span>
                <span>
                  <select
                    className="input w-full"
                    value={audienceId}
                    disabled={readOnly}
                    onChange={(event) => {
                      setAudienceId(event.target.value);
                      markDirty();
                    }}
                  >
                    <option value="">Choose an audience</option>
                    {audienceOptions.map((audience) => (
                      <option key={audience.id} value={audience.id}>
                        {audience.name}
                      </option>
                    ))}
                  </select>
                  {audienceId && recipientCount !== null ? (
                    <span className="mt-1 block text-xs text-muted">
                      {recipientCount} consented recipient{recipientCount === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </span>
              </label>
              <label className="grid items-center gap-2 sm:grid-cols-[7rem_1fr]">
                <span className="text-muted">Don&apos;t send to</span>
                <span>
                  <select
                    className="input w-full"
                    value={excludeAudienceId}
                    disabled={readOnly}
                    onChange={(event) => {
                      setExcludeAudienceId(event.target.value);
                      markDirty();
                    }}
                  >
                    <option value="">None</option>
                    {audienceOptions
                      .filter((audience) => audience.id !== audienceId)
                      .map((audience) => (
                        <option key={audience.id} value={audience.id}>
                          {audience.name}
                        </option>
                      ))}
                  </select>
                  <span className="mt-1 block text-xs text-muted">
                    Optional. Contacts in this list are removed from the send.
                  </span>
                </span>
              </label>
              <div className="grid items-center gap-2 sm:grid-cols-[7rem_1fr]">
                <span className="text-muted">From</span>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    className="input w-full"
                    aria-label="From name"
                    value={fromName}
                    disabled={readOnly}
                    onChange={(event) => {
                      setFromName(event.target.value);
                      markDirty();
                    }}
                  />
                  <input
                    className="input w-full"
                    aria-label="From email"
                    value={fromEmail}
                    disabled={readOnly}
                    onChange={(event) => {
                      setFromEmail(event.target.value);
                      markDirty();
                    }}
                  />
                </div>
              </div>
            </>
          ) : null}
          <label className="grid items-center gap-2 sm:grid-cols-[7rem_1fr]">
            <span className="text-muted">Subject line</span>
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="input min-w-[12rem] flex-1"
                value={subject}
                disabled={readOnly}
                onChange={(event) => {
                  setSubject(event.target.value);
                  markDirty();
                }}
              />
              {!readOnly ? (
                <button
                  type="button"
                  className="btn-secondary inline-flex items-center gap-1 px-2 py-1.5 text-xs"
                  disabled={aiBusy}
                  onClick={() => void suggestSubjectsAi()}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Suggest
                </button>
              ) : null}
            </div>
          </label>
          {subjectSuggestions.length > 0 ? (
            <ul className="space-y-1 sm:pl-[7.5rem]">
              {subjectSuggestions.map((option) => (
                <li key={option.subject}>
                  <button
                    type="button"
                    className="w-full rounded-lg border border-border px-3 py-2 text-left text-sm hover:border-brand"
                    onClick={() => {
                      setSubject(option.subject);
                      setPreviewText(option.preview);
                      setSubjectSuggestions([]);
                      markDirty();
                    }}
                  >
                    <span className="font-medium text-brand">{option.subject}</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {option.preview}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <label className="grid items-center gap-2 sm:grid-cols-[7rem_1fr]">
            <span className="text-muted">Preview text</span>
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="input min-w-[12rem] flex-1"
                value={previewText}
                disabled={readOnly}
                onChange={(event) => {
                  setPreviewText(event.target.value);
                  markDirty();
                }}
              />
              {!readOnly ? (
                <button
                  type="button"
                  className="btn-secondary inline-flex items-center gap-1 px-2 py-1.5 text-xs"
                  disabled={aiBusy}
                  onClick={() => void improvePreviewAi()}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Improve
                </button>
              ) : null}
            </div>
          </label>
          {previewSuggestions.length > 0 ? (
            <ul className="space-y-1 sm:pl-[7.5rem]">
              {previewSuggestions.map((option) => (
                <li key={option}>
                  <button
                    type="button"
                    className="w-full rounded-lg border border-border px-3 py-2 text-left text-sm hover:border-brand"
                    onClick={() => {
                      setPreviewText(option);
                      setPreviewSuggestions([]);
                      markDirty();
                    }}
                  >
                    {option}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {!readOnly ? (
            <>
              <label className="grid items-start gap-2 sm:grid-cols-[7rem_1fr]">
                <span className="pt-2 text-muted">Brief</span>
                <textarea
                  className="input min-h-[4.5rem] w-full resize-y"
                  value={brief}
                  placeholder="What should this email say? (AI uses this for Draft from brief)"
                  onChange={(event) => {
                    setBrief(event.target.value);
                    markDirty();
                  }}
                />
              </label>
              <div className="flex flex-wrap gap-2 sm:pl-[7.5rem]">
                <button
                  type="button"
                  className="btn-secondary inline-flex items-center gap-1 px-2 py-1.5 text-xs"
                  disabled={aiBusy}
                  onClick={() => void draftFromBriefAi()}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {aiBusy ? "Drafting…" : "Draft from brief"}
                </button>
                {dirty ? (
                  <span className="self-center text-xs text-muted">
                    Unsaved changes…
                  </span>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </div>
      <div className="flex min-h-[70vh] flex-1">
        <EmailPalette
          tab={tab}
          onTab={setTab}
          disabled={readOnly}
          onAddBlock={addBlock}
          onAddSection={(preset) => addSection(preset)}
        />
        <div className="min-w-0 flex-1 overflow-auto">
          {previewing ? (
            <div
              className="min-h-full px-6 pb-16 pt-8"
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
              footerLinks={footerLinks}
              readOnly={readOnly}
              insertRequest={insertRequest}
              onSelect={setSelection}
              onLiveBlock={(blockId, patch) => {
                history.live(updateBlock(history.designRef.current, blockId, patch));
                markDirty();
              }}
              onCommitBlock={() => {
                history.commit(history.designRef.current);
                markDirty();
              }}
              onDrop={(payload, target) => {
                onDrop(payload, target);
                markDirty();
              }}
              onMove={(blockId, direction) =>
                commitDesign(moveBlockBy(history.designRef.current, blockId, direction))
              }
              onDuplicate={(blockId) =>
                commitDesign(duplicateBlock(history.designRef.current, blockId))
              }
              onDelete={(blockId) => {
                const found = findBlock(history.designRef.current, blockId);
                if (found && sectionIsBrandLocked(found.sectionId)) return;
                commitDesign(removeBlock(history.designRef.current, blockId));
                setSelection({ type: "email" });
              }}
              onMoveSection={(sectionId, direction) => {
                if (sectionIsBrandLocked(sectionId)) return;
                commitDesign(moveSection(history.designRef.current, sectionId, direction));
              }}
              onDuplicateSection={(sectionId) =>
                commitDesign(duplicateSection(history.designRef.current, sectionId))
              }
              onDeleteSection={(sectionId) => {
                if (sectionIsBrandLocked(sectionId)) return;
                commitDesign(removeSection(history.designRef.current, sectionId));
                setSelection({ type: "email" });
              }}
              onAddSectionAfter={(sectionId) => {
                const index = history.designRef.current.sections.findIndex(
                  (item) => item.id === sectionId
                );
                const before =
                  index >= 0
                    ? history.designRef.current.sections[index + 1]?.id ?? null
                    : null;
                addSection("1", before);
              }}
              onAddColumn={(sectionId) => {
                if (sectionIsBrandLocked(sectionId)) return;
                commitDesign(addColumn(history.designRef.current, sectionId));
                setSelection({ type: "section", sectionId });
              }}
              onRemoveColumn={(sectionId, columnId) => {
                if (sectionIsBrandLocked(sectionId)) return;
                commitDesign(
                  removeColumn(history.designRef.current, sectionId, columnId)
                );
                setSelection({ type: "section", sectionId });
              }}
            />
          )}
        </div>
        <EmailInspector
          design={history.design}
          section={section}
          block={block}
          disabled={
            readOnly ||
            Boolean(section && sectionIsBrandLocked(section.id))
          }
          onSelectEmail={() => setSelection({ type: "email" })}
          onSelectSection={() => {
            if (section) {
              setSelection({ type: "section", sectionId: section.id });
            }
          }}
          onDesign={(patch) =>
            commitDesign({
              ...history.designRef.current,
              styles: { ...history.designRef.current.styles, ...patch },
            })
          }
          onSection={(patch: Partial<EmailSection>) => {
            if (!section) return;
            commitDesign(updateSection(history.designRef.current, section.id, patch));
          }}
          onPreset={(preset) => {
            if (!section) return;
            commitDesign(setSectionPreset(history.designRef.current, section.id, preset));
          }}
          onColumnWidths={(widths) => {
            if (!section) return;
            commitDesign(
              setColumnWidths(history.designRef.current, section.id, widths)
            );
          }}
          onBlock={(patch: Partial<EmailBlock>) => {
            if (!block) return;
            commitDesign(updateBlock(history.designRef.current, block.id, patch));
          }}
          onInsertMerge={insertMergeToken}
          onRewrite={
            block && (block.type === "heading" || block.type === "text")
              ? (tone) => void rewriteSelection(tone)
              : undefined
          }
          rewriting={aiBusy}
        />
      </div>
      {reviewOpen && kind === "campaign" ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/20 md:left-sidebar"
            onClick={() => setReviewOpen(false)}
          />
          <aside className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-white">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="font-display text-lg text-brand">Review and schedule</h2>
              <button
                type="button"
                className="btn-secondary px-2 py-1 text-sm"
                onClick={() => setReviewOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-sm">
              <dl className="space-y-3">
                <div>
                  <dt className="text-muted">From name</dt>
                  <dd>{fromName || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted">From address</dt>
                  <dd>{fromEmail || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted">Subject line</dt>
                  <dd>{subject || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted">Preview text</dt>
                  <dd>{previewText || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted">Send to</dt>
                  <dd>{audienceName || "Choose an audience"}</dd>
                </div>
                <div>
                  <dt className="text-muted">Don&apos;t send to</dt>
                  <dd>{excludeAudienceName || "None"}</dd>
                </div>
                <div>
                  <dt className="text-muted">Total recipients</dt>
                  <dd>
                    {recipientCount === null
                      ? "—"
                      : `${recipientCount} consented`}
                  </dd>
                </div>
              </dl>
              <fieldset className="space-y-2">
                <legend className="text-muted">When will you send the email?</legend>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="when"
                    checked={whenMode === "now"}
                    onChange={() => setWhenMode("now")}
                  />
                  Send now
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="when"
                    checked={whenMode === "later"}
                    onChange={() => setWhenMode("later")}
                  />
                  Schedule for later
                </label>
              </fieldset>
              {whenMode === "later" ? (
                <div className="grid grid-cols-2 gap-2">
                  <label>
                    <span className="text-muted">Date</span>
                    <input
                      type="date"
                      className="input mt-1 w-full"
                      value={scheduleDate}
                      onChange={(event) => setScheduleDate(event.target.value)}
                    />
                  </label>
                  <label>
                    <span className="text-muted">Time (London)</span>
                    <input
                      type="time"
                      className="input mt-1 w-full"
                      value={scheduleTime}
                      onChange={(event) => setScheduleTime(event.target.value)}
                    />
                  </label>
                </div>
              ) : null}
              {plannedIso ? (
                <p className="text-muted">
                  Send time {formatLondonStamp(plannedIso)} London. Everyone receives it at that time.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
              {whenMode === "later" ? (
                <button
                  type="button"
                  className="btn-primary px-3 py-1.5 text-sm"
                  disabled={sending || saving || !audienceId}
                  onClick={() => void scheduleSend()}
                >
                  Schedule
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-primary px-3 py-1.5 text-sm"
                  disabled={sending || saving || !audienceId}
                  onClick={() => void sendNow()}
                >
                  {sending ? "Starting…" : "Send now"}
                </button>
              )}
              <button
                type="button"
                className="btn-secondary px-3 py-1.5 text-sm"
                onClick={() => {
                  setReviewOpen(false);
                  setPreviewing(true);
                }}
              >
                Preview
              </button>
              <button
                type="button"
                className="btn-secondary px-3 py-1.5 text-sm"
                onClick={() => setReviewOpen(false)}
              >
                Cancel
              </button>
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
