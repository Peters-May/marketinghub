/** Plain text excerpt from design blocks for AI context and previews. */
export function excerptFromDesign(design: {
  sections: Array<{
    columns: Array<{
      blocks: Array<{ type: string; text?: string; html?: string; label?: string }>;
    }>;
  }>;
}): string {
  const parts: string[] = [];
  for (const section of design.sections) {
    for (const column of section.columns) {
      for (const block of column.blocks) {
        if (block.type === "heading" && block.text) parts.push(block.text);
        if (block.type === "text" && block.html) {
          parts.push(
            block.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
          );
        }
        if (block.type === "button" && block.label) parts.push(block.label);
        if (parts.join(" ").length > 800) {
          return parts.join(" ").slice(0, 800);
        }
      }
    }
  }
  return parts.join(" ").slice(0, 800);
}
