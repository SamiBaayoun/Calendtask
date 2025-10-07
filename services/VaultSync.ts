import { App, TFile, TFolder, Vault, Notice } from 'obsidian';
import { TodoParser } from './TodoParser';
import type { Todo } from '../types';

/**
 * VaultSync service
 * Responsible for reading todos from the vault and keeping them synchronized
 */
export class VaultSync {
  private app: App;
  private parser: TodoParser;
  private onTodosUpdate: (todos: Todo[]) => void;
  private todos: Todo[] = [];

  constructor(app: App, onTodosUpdate: (todos: Todo[]) => void) {
    this.app = app;
    this.parser = new TodoParser();
    this.onTodosUpdate = onTodosUpdate;
  }

  /**
   * Initial scan of the vault to load all todos
   */
  async scanVault(): Promise<Todo[]> {
    const todos: Todo[] = [];
    const markdownFiles = this.app.vault.getMarkdownFiles();

    for (const file of markdownFiles) {
      try {
        const fileTodos = await this.parseTodosFromFile(file);
        todos.push(...fileTodos);
      } catch (error) {
        console.error(`Error parsing todos from ${file.path}:`, error);
      }
    }

    this.todos = todos;
    this.onTodosUpdate(todos);
    return todos;
  }

  /**
   * Parse todos from a specific file
   */
  async parseTodosFromFile(file: TFile): Promise<Todo[]> {
    const content = await this.app.vault.read(file);
    const lines = content.split('\n');
    const todos: Todo[] = [];

    lines.forEach((line, index) => {
      const todo = this.parser.parseTaskLine(line, file.path, index);
      if (todo) {
        todos.push(todo);
      }
    });

    return todos;
  }

  /**
   * Register file watchers for real-time synchronization
   */
  registerWatchers(): void {
    // Watch for file modifications
    this.app.vault.on('modify', async (file) => {
      if (!(file instanceof TFile) || file.extension !== 'md') return;
      await this.handleFileModify(file);
    });

    // Watch for file deletions
    this.app.vault.on('delete', async (file) => {
      if (!(file instanceof TFile) || file.extension !== 'md') return;
      await this.handleFileDelete(file);
    });

    // Watch for file renames
    this.app.vault.on('rename', async (file, oldPath) => {
      if (!(file instanceof TFile) || file.extension !== 'md') return;
      await this.handleFileRename(file, oldPath);
    });

    // Watch for file creation
    this.app.vault.on('create', async (file) => {
      if (!(file instanceof TFile) || file.extension !== 'md') return;
      await this.handleFileCreate(file);
    });
  }

  /**
   * Handle file modification
   */
  private async handleFileModify(file: TFile): Promise<void> {
    try {
      const updatedTodos = await this.parseTodosFromFile(file);

      // Remove todos from this file
      this.todos = this.todos.filter(todo => todo.filePath !== file.path);

      // Add updated todos
      this.todos.push(...updatedTodos);

      this.onTodosUpdate([...this.todos]);
    } catch (error) {
      console.error(`Error handling file modify for ${file.path}:`, error);
    }
  }

  /**
   * Handle file deletion
   */
  private async handleFileDelete(file: TFile): Promise<void> {
    const deletedCount = this.todos.filter(todo => todo.filePath === file.path).length;

    // Remove all todos from this file
    this.todos = this.todos.filter(todo => todo.filePath !== file.path);

    if (deletedCount > 0) {
      new Notice(`${deletedCount} todo(s) removed from ${file.basename}`);
      this.onTodosUpdate([...this.todos]);
    }
  }

  /**
   * Handle file rename
   */
  private async handleFileRename(file: TFile, oldPath: string): Promise<void> {
    // Update file paths for all todos from the old path
    this.todos = this.todos.map(todo => {
      if (todo.filePath === oldPath) {
        return { ...todo, filePath: file.path };
      }
      return todo;
    });

    this.onTodosUpdate([...this.todos]);
  }

  /**
   * Handle file creation
   */
  private async handleFileCreate(file: TFile): Promise<void> {
    try {
      const newTodos = await this.parseTodosFromFile(file);

      if (newTodos.length > 0) {
        this.todos.push(...newTodos);
        this.onTodosUpdate([...this.todos]);
      }
    } catch (error) {
      console.error(`Error handling file create for ${file.path}:`, error);
    }
  }

  /**
   * Update a todo in the vault (modify the markdown file)
   */
  async updateTodoInVault(todo: Todo, updates: Partial<Todo>): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(todo.filePath);
    if (!(file instanceof TFile)) {
      console.error(`File not found: ${todo.filePath}`);
      return;
    }

    try {
      const content = await this.app.vault.read(file);
      const lines = content.split('\n');

      if (todo.lineNumber === undefined || todo.lineNumber >= lines.length) {
        console.error(`Invalid line number for todo: ${todo.lineNumber}`);
        return;
      }

      const line = lines[todo.lineNumber];
      let updatedLine = line;

      // Update date
      if ('date' in updates) {
        // Remove existing date (both old @ and new ⏳/⏰ formats)
        updatedLine = updatedLine.replace(/@\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?/g, '');
        updatedLine = updatedLine.replace(/⏳\d{4}-\d{2}-\d{2}/g, '');
        updatedLine = updatedLine.replace(/⏰\d{2}:\d{2}/g, '');

        // Add new date if provided (nouveau format Tasks)
        if (updates.date) {
          const scheduledDateStr = `⏳${updates.date}`;
          // Insert before priority or at the end
          updatedLine = updatedLine.replace(/^(- \[.\] .+?)(\s*!|⏱|$)/, `$1 ${scheduledDateStr} $2`);

          // Determine time to use: update value if specified, otherwise keep existing
          const timeToUse = updates.time !== undefined ? updates.time : todo.time;

          if (timeToUse) {
            const timeStr = `⏰${timeToUse}`;
            // Insert after date
            updatedLine = updatedLine.replace(/(⏳\d{4}-\d{2}-\d{2})(\s*)/, `$1 ${timeStr}$2`);
          }
        }
      } else if ('time' in updates) {
        // Update only time (keep existing date)
        updatedLine = updatedLine.replace(/⏰\d{2}:\d{2}/g, '');

        if (updates.time && todo.date) {
          // Migrate old date format to new format if needed
          if (updatedLine.match(/@\d{4}-\d{2}-\d{2}/)) {
            updatedLine = updatedLine.replace(/@\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?/g, `⏳${todo.date}`);
          }

          const timeStr = `⏰${updates.time}`;
          // Insert after date
          updatedLine = updatedLine.replace(/(⏳\d{4}-\d{2}-\d{2})/, `$1 ${timeStr}`);
        }
      }

      // Update duration
      if ('duration' in updates) {
        // Remove existing duration
        updatedLine = updatedLine.replace(/⏱\d+(?:min|h)/g, '');

        // Add new duration if provided
        if (updates.duration) {
          const durationStr = updates.duration >= 60
            ? `⏱${Math.round(updates.duration / 60)}h`
            : `⏱${updates.duration}min`;

          // Insert before tags or at the end
          updatedLine = updatedLine.replace(/^(- \[.\] .+?)(\s*#|$)/, `$1 ${durationStr}$2`);
        }
      }

      // Update status
      if ('status' in updates) {
        const statusChar = updates.status === 'done' ? 'x'
          : updates.status === 'in-progress' ? '>'
          : updates.status === 'cancelled' ? '-'
          : ' ';

        updatedLine = updatedLine.replace(/^(- \[)[^\]]*(\])/, `$1${statusChar}$2`);
      }

      // Update priority
      if ('priority' in updates) {
        // Remove existing priority
        updatedLine = updatedLine.replace(/!\s*(?:low|medium|high|critical)/gi, '');

        // Add new priority if provided
        if (updates.priority) {
          // Insert before tags or at the end
          updatedLine = updatedLine.replace(/^(- \[.\] .+?)(\s*#|$)/, `$1 !${updates.priority}$2`);
        }
      }

      // Clean up multiple spaces before updating
      updatedLine = updatedLine.replace(/\s{2,}/g, ' ');

      // Update the line
      lines[todo.lineNumber] = updatedLine;

      // Write back to file
      await this.app.vault.modify(file, lines.join('\n'));

    } catch (error) {
      console.error(`Error updating todo in vault:`, error);
      new Notice(`Failed to update todo in ${file.basename}`);
    }
  }

  /**
   * Remove date from a todo (move it back to unscheduled)
   */
  async removeDateFromTodo(todo: Todo): Promise<void> {
    await this.updateTodoInVault(todo, { date: undefined, time: undefined });
  }

  /**
   * Get current todos
   */
  getTodos(): Todo[] {
    return [...this.todos];
  }
}
