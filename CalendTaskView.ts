import { ItemView, WorkspaceLeaf } from 'obsidian';
import { mount, unmount } from 'svelte';
import TodoColumn from './components/TodoColumn.svelte';
import CalendarView from './components/CalendarView.svelte';

export const VIEW_TYPE_CALENDTASK = 'calendtask-view';

export class CalendTaskView extends ItemView {
  todoColumn: ReturnType<typeof TodoColumn> | undefined;
  calendarView: ReturnType<typeof CalendarView> | undefined;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType() {
    return VIEW_TYPE_CALENDTASK;
  }

  getDisplayText() {
    return 'CalendTask';
  }

  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('calendtask-view-container');

    const todoColumnEl = container.createDiv('calendtask-todo-column');
    this.todoColumn = mount(TodoColumn, {
      target: todoColumnEl,
    });

    const calendarViewEl = container.createDiv('calendtask-calendar-view');
    this.calendarView = mount(CalendarView, {
      target: calendarViewEl,
    });
  }

  async onClose() {
    if (this.todoColumn) {
      unmount(this.todoColumn);
    }
    if (this.calendarView) {
      unmount(this.calendarView);
    }
  }
}