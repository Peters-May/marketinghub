"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  Link as LinkIcon,
  Heading2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { plainTextToEditorHtml } from "@/lib/plain-text";
import { normalizeRichTextStorage } from "@/lib/sanitize";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function editorHtml(value: string): string {
  return plainTextToEditorHtml(value || "");
}

function sameEditorContent(a: string, b: string): boolean {
  return (
    normalizeRichTextStorage(editorHtml(a)) ===
    normalizeRichTextStorage(editorHtml(b))
  );
}

type RichTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  compact?: boolean;
};

function ToolbarButton({
  active,
  onClick,
  label,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-sand hover:text-foreground",
        active && "bg-accent-soft text-brand"
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/**
 * TipTap rich text editor for notes / long text fields.
 * Stores sanitized HTML.
 */
export function RichTextEditorImpl({
  value,
  onChange,
  onBlur,
  placeholder = "Start typing…",
  className,
  minHeight = "96px",
  compact = false,
}: RichTextEditorProps) {
  const editorRef = useRef<ReturnType<typeof useEditor> | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-accent underline underline-offset-2",
          rel: "noopener noreferrer",
          target: "_blank",
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: editorHtml(value),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(
          "rich-text-editor prose-hub max-w-none px-3 py-2 focus:outline-none",
          compact ? "text-sm" : "text-sm"
        ),
        style: `min-height: ${minHeight};`,
      },
      handlePaste: (_view, event) => {
        const html = event.clipboardData?.getData("text/html")?.trim();
        if (html) return false;
        const plain = event.clipboardData?.getData("text/plain");
        if (plain != null && plain !== "" && editorRef.current) {
          const paragraphs = plain
            .split(/\r?\n/)
            .map((line) => `<p>${escapeHtml(line) || "<br>"}</p>`)
            .join("");
          editorRef.current.chain().insertContent(paragraphs).run();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChange(normalizeRichTextStorage(ed.getHTML()));
    },
    onBlur: () => {
      onBlur?.();
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const next = editorHtml(value);
    if (sameEditorContent(current, next)) {
      return;
    }
    if (!next) {
      if (current !== "<p></p>") editor.commands.clearContent(false);
      return;
    }
    editor.commands.setContent(next, false);
  }, [editor, value]);

  const handleToolbarMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  if (!editor) {
    return (
      <div
        className={cn(
          "field flex items-center text-sm text-muted",
          className
        )}
        style={{ minHeight }}
      >
        Loading editor…
      </div>
    );
  }

  return (
    <div className={cn("rich-text-field w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-border bg-white", className)}>
      <div
        className="flex flex-wrap items-center gap-0.5 border-b border-border bg-sand/40 px-1.5 py-1"
        onMouseDown={handleToolbarMouseDown}
      >
        <ToolbarButton
          label="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Strikethrough"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarButton>
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        <ToolbarButton
          label="Heading"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Bullet list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        <ToolbarButton
          label="Link"
          active={editor.isActive("link")}
          onClick={() => {
            if (editor.isActive("link")) {
              editor.chain().focus().unsetLink().run();
              return;
            }
            const url = window.prompt("Enter URL:");
            if (url) editor.chain().focus().setLink({ href: url }).run();
          }}
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>
      <div className="max-w-full overflow-x-hidden overflow-y-auto" style={{ minHeight }}>
        <EditorContent editor={editor} className="max-w-full" />
      </div>
    </div>
  );
}
