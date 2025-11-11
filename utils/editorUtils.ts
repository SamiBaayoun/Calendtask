import { App, TFile, MarkdownView } from 'obsidian';
import type { Todo } from '../types';

/**
 * Calculate cursor position at end of todo text (before metadata)
 */
function getCursorPositionAfterText(lineContent: string): number {
  // Match todo checkbox pattern and get text after it
  const todoMatch = lineContent.match(/^(\s*-\s*\[.\]\s*)/);
  if (!todoMatch) return 0;

  const prefixLength = todoMatch[0].length;
  const afterPrefix = lineContent.substring(prefixLength);

  // Find first metadata marker: ⏳, ⏰, ⏱, #, !, @ (with optional spaces before)
  const metadataMatch = afterPrefix.match(/\s+(⏳|⏰|⏱|#|!|@)/);

  if (metadataMatch && metadataMatch.index !== undefined) {
    // Position is right before the metadata (after trimming spaces)
    return prefixLength + metadataMatch.index;
  }

  // No metadata found, go to end of line (trimmed)
  return prefixLength + afterPrefix.trimEnd().length;
}

/**
 * Open a file in the editor and focus on a specific line
 */
export async function openTodoInEditor(app: App, todo: Todo): Promise<void> {
  if (!todo.filePath) {
    return;
  }

  const file = app.vault.getAbstractFileByPath(todo.filePath);

  if (!(file instanceof TFile)) {
    return;
  }

  // Open the file
  const leaf = app.workspace.getLeaf(false);
  await leaf.openFile(file);

  // Focus on the specific line if lineNumber is available
  if (todo.lineNumber !== undefined) {
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    if (view) {
      const editor = view.editor;

      // Get cursor position at end of todo text
      const lineContent = editor.getLine(todo.lineNumber);
      const cursorPos = getCursorPositionAfterText(lineContent);

      // Move cursor to the end of todo text
      editor.setCursor({ line: todo.lineNumber, ch: cursorPos });

      // Scroll to make the line visible
      editor.scrollIntoView({
        from: { line: todo.lineNumber, ch: cursorPos },
        to: { line: todo.lineNumber, ch: cursorPos }
      }, true);

      // Focus the editor
      editor.focus();
    }
  }
}

/**
 * Open a file in a new pane
 */
export async function openTodoInNewPane(app: App, todo: Todo): Promise<void> {
  if (!todo.filePath) {
    return;
  }

  const file = app.vault.getAbstractFileByPath(todo.filePath);

  if (!(file instanceof TFile)) {
    return;
  }

  // Open in a new pane
  const leaf = app.workspace.getLeaf('split');
  await leaf.openFile(file);

  if (todo.lineNumber !== undefined) {
    const view = leaf.view;
    if (view instanceof MarkdownView) {
      const editor = view.editor;

      // Get cursor position at end of todo text
      const lineContent = editor.getLine(todo.lineNumber);
      const cursorPos = getCursorPositionAfterText(lineContent);

      editor.setCursor({ line: todo.lineNumber, ch: cursorPos });
      editor.scrollIntoView({
        from: { line: todo.lineNumber, ch: cursorPos },
        to: { line: todo.lineNumber, ch: cursorPos }
      }, true);
      editor.focus();
    }
  }
}
