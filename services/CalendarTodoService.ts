import type { Todo } from '../types';

/**
 * Service to manage calendar-only todos (stored in JSON, not in vault files)
 */
export class CalendarTodoService {
  /**
   * Generate a unique ID for calendar-only todos
   */
  static generateId(): string {
    return `calendar-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Create a new calendar-only todo
   */
  static createTodo(
    text: string,
    date: string,
    time: string,
    duration?: number
  ): Todo {
    return {
      id: this.generateId(),
      text,
      date,
      time,
      duration: duration || 30,
      tags: [],
      status: 'todo',
      isCalendarOnly: true,
      // filePath and lineNumber are undefined for calendar-only todos
    };
  }

  /**
   * Check if a todo is calendar-only
   */
  static isCalendarOnly(todo: Todo): boolean {
    return todo.isCalendarOnly === true;
  }

  /**
   * Check if a todo is from vault
   */
  static isFromVault(todo: Todo): boolean {
    return !this.isCalendarOnly(todo) && !!todo.filePath;
  }
}
