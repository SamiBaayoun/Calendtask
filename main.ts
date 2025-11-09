import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { CalendTaskView, VIEW_TYPE_CALENDTASK } from './CalendTaskView';
import type { CalendarEvent, Todo } from './types';

interface CalendTaskSettings {
	defaultDuration: number;
	weekStartDay: 'monday' | 'sunday';
	timeFormat: '12h' | '24h';
}

interface CalendTaskData {
	calendarEvents: CalendarEvent[];
	calendarOnlyTodos: Todo[];
	uiState: {
		collapsedTags: string[];
	};
}

const DEFAULT_SETTINGS: CalendTaskSettings = {
	defaultDuration: 30,
	weekStartDay: 'monday',
	timeFormat: '24h'
}

const DEFAULT_DATA: CalendTaskData = {
	calendarEvents: [],
	calendarOnlyTodos: [],
	uiState: {
		collapsedTags: []
	}
}

export default class CalendTaskPlugin extends Plugin {
	settings: CalendTaskSettings;
	data: CalendTaskData;

	async onload() {
		await this.loadSettings();
		await this.loadPluginData();

		this.registerView(
			VIEW_TYPE_CALENDTASK,
			(leaf) => new CalendTaskView(leaf, this)
		);

		this.addRibbonIcon('calendar-with-checkmark', 'Open Calendtask', () => {
			void this.activateView();
		});

		this.addCommand({
			id: 'open-view',
			name: 'Open view',
			callback: () => {
				void this.activateView();
			}
		});

		this.addSettingTab(new CalendTaskSettingTab(this.app, this));
	}

	onunload() {
		// Obsidian handles cleanup automatically - don't detach leaves here
	}

	async activateView() {
		// Check if view is already open
		const existingLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDTASK);

		if (existingLeaves.length > 0) {
			// If view already exists, just reveal it
			void this.app.workspace.revealLeaf(existingLeaves[0]);
		} else {
			// Otherwise, create a new leaf for the view
			const leaf = this.app.workspace.getLeaf('tab');
			await leaf.setViewState({
				type: VIEW_TYPE_CALENDTASK,
				active: true,
			});
			void this.app.workspace.revealLeaf(leaf);
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async loadPluginData() {
		const loadedData = await this.loadData();
		this.data = Object.assign({}, DEFAULT_DATA, loadedData);
	}

	async savePluginData() {
		await this.saveData(this.data);
	}

	getCalendarEvents(): CalendarEvent[] {
		return this.data.calendarEvents;
	}

	async updateCalendarEvents(events: CalendarEvent[]) {
		this.data.calendarEvents = events;
		await this.savePluginData();
	}

	getCollapsedTags(): string[] {
		return this.data.uiState.collapsedTags;
	}

	async updateCollapsedTags(tags: string[]) {
		this.data.uiState.collapsedTags = tags;
		await this.savePluginData();
	}

	getCalendarOnlyTodos(): Todo[] {
		return this.data.calendarOnlyTodos || [];
	}

	async addCalendarOnlyTodo(todo: Todo) {
		if (!this.data.calendarOnlyTodos) {
			this.data.calendarOnlyTodos = [];
		}
		this.data.calendarOnlyTodos.push(todo);
		await this.savePluginData();
	}

	async updateCalendarOnlyTodo(todoId: string, updates: Partial<Todo>) {
		if (!this.data.calendarOnlyTodos) return;

		const index = this.data.calendarOnlyTodos.findIndex(t => t.id === todoId);
		if (index >= 0) {
			this.data.calendarOnlyTodos[index] = {
				...this.data.calendarOnlyTodos[index],
				...updates
			};
			await this.savePluginData();
		}
	}

	async deleteCalendarOnlyTodo(todoId: string) {
		if (!this.data.calendarOnlyTodos) return;

		this.data.calendarOnlyTodos = this.data.calendarOnlyTodos.filter(t => t.id !== todoId);
		await this.savePluginData();
	}
}

class CalendTaskSettingTab extends PluginSettingTab {
	plugin: CalendTaskPlugin;

	constructor(app: App, plugin: CalendTaskPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Calendtask settings')
			.setHeading();

		new Setting(containerEl)
			.setName('Default duration')
			.setDesc('Default duration for new tasks (in minutes)')
			.addText(text => text
				.setPlaceholder('30')
				.setValue(String(this.plugin.settings.defaultDuration))
				.onChange(async (value) => {
					const duration = parseInt(value);
					if (!isNaN(duration) && duration > 0) {
						this.plugin.settings.defaultDuration = duration;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Week start day')
			.setDesc('First day of the week')
			.addDropdown(dropdown => dropdown
				.addOption('monday', 'Monday')
				.addOption('sunday', 'Sunday')
				.setValue(this.plugin.settings.weekStartDay)
				.onChange(async (value) => {
					this.plugin.settings.weekStartDay = value as 'monday' | 'sunday';
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Time format')
			.setDesc('Display time in 12-hour or 24-hour format')
			.addDropdown(dropdown => dropdown
				.addOption('12h', '12-hour (AM/PM)')
				.addOption('24h', '24-hour')
				.setValue(this.plugin.settings.timeFormat)
				.onChange(async (value) => {
					this.plugin.settings.timeFormat = value as '12h' | '24h';
					await this.plugin.saveSettings();
				}));
	}
}
