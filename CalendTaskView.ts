import { App, ItemView, WorkspaceLeaf } from 'obsidian';
import { mount, unmount } from 'svelte';
import TodoColumn from './components/TodoColumn.svelte';
import CalendarView from './components/CalendarView.svelte';
import { VaultSync } from './services/VaultSync';
import { setVaultTodos, calendarOnlyTodos } from './stores/todoStore';
import { calendarEvents } from './stores/calendarStore';
import type CalendTaskPlugin from './main';

export const VIEW_TYPE_CALENDTASK = 'calendtask-view';

type TodoColumnContext = App | VaultSync;
type CalendarViewContext = App | VaultSync | CalendTaskPlugin;

export class CalendTaskView extends ItemView {
  todoColumn: ReturnType<typeof TodoColumn> | undefined;
  calendarView: ReturnType<typeof CalendarView> | undefined;
  vaultSync: VaultSync;
  plugin: CalendTaskPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: CalendTaskPlugin) {
    super(leaf);
    this.plugin = plugin;

    // Initialize VaultSync
    this.vaultSync = new VaultSync(this.app, (updatedTodos) => {
      setVaultTodos(updatedTodos);
    });
  }

  getViewType() {
    return VIEW_TYPE_CALENDTASK;
  }

  getDisplayText() {
    return 'Calendtask';
  }

  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('calendtask-view-container');

    // Load calendar events from plugin data
    const savedEvents = this.plugin.getCalendarEvents();
    calendarEvents.set(savedEvents);

    // Load calendar-only todos from plugin data
    const savedCalendarOnlyTodos = this.plugin.getCalendarOnlyTodos();
    calendarOnlyTodos.set(savedCalendarOnlyTodos);

    // Scan vault for todos
    await this.vaultSync.scanVault();

    // Register file watchers
    this.vaultSync.registerWatchers();

    const todoColumnEl = container.createDiv('calendtask-todo-column');
    this.todoColumn = mount(TodoColumn, {
      target: todoColumnEl,
      context: new Map<string, TodoColumnContext>([
        ['app', this.app],
        ['vaultSync', this.vaultSync]
      ])
    });

    const calendarViewEl = container.createDiv('calendtask-calendar-view');
    this.calendarView = mount(CalendarView, {
      target: calendarViewEl,
      context: new Map<string, CalendarViewContext>([
        ['app', this.app],
        ['vaultSync', this.vaultSync],
        ['plugin', this.plugin]
      ])
    });

    // Subscribe to calendar events changes to persist them
    calendarEvents.subscribe((events) => {
      void this.plugin.updateCalendarEvents(events);
    });
  }

  async onClose() {
    if (this.todoColumn) {
      void unmount(this.todoColumn);
    }
    if (this.calendarView) {
      void unmount(this.calendarView);
    }
  }
}