import { App, TFile, MarkdownView } from 'obsidian';
import type { Todo } from '../types';

/**
 * Open a file in the editor and focus on a specific line
 */
export async function openTodoInEditor(app: App, todo: Todo): Promise<void> {
  const file = app.vault.getAbstractFileByPath(todo.filePath);

  if (!(file instanceof TFile)) {
    console.error(`File not found: ${todo.filePath}`);
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

      // Move cursor to the line
      editor.setCursor({ line: todo.lineNumber, ch: 0 });

      // Scroll to make the line visible
      editor.scrollIntoView({
        from: { line: todo.lineNumber, ch: 0 },
        to: { line: todo.lineNumber, ch: 0 }
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
  const file = app.vault.getAbstractFileByPath(todo.filePath);

  if (!(file instanceof TFile)) {
    console.error(`File not found: ${todo.filePath}`);
    return;
  }

  // Open in a new pane
  const leaf = app.workspace.getLeaf('split');
  await leaf.openFile(file);

  if (todo.lineNumber !== undefined) {
    const view = leaf.view;
    if (view instanceof MarkdownView) {
      const editor = view.editor;
      editor.setCursor({ line: todo.lineNumber, ch: 0 });
      editor.scrollIntoView({
        from: { line: todo.lineNumber, ch: 0 },
        to: { line: todo.lineNumber, ch: 0 }
      }, true);
      editor.focus();
    }
  }
}
