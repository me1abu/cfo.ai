/**
 * The assistant panel shows replies as plain text. The model is asked not to use Markdown but
 * sometimes does anyway, so the common markers are removed before the reply is shown.
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^(\s*)[*•]\s+/gm, "$1- ")
    .replace(/`([^`\n]+)`/g, "$1");
}
