# CalendTask

A powerful Obsidian plugin that combines task management with a visual weekly calendar. Schedule your tasks with drag-and-drop, manage priorities, and track time—all within your Obsidian vault.

## Features

### 📅 Weekly Calendar View
- **Visual scheduling**: Drag tasks from the sidebar onto specific time slots
- **All-day events**: Dedicated zone for tasks without specific times
- **Time slots**: Hourly grid with 30-minute snap increments
- **Current time indicator**: Real-time visual marker showing the current time
- **Today highlighting**: Clear visual distinction of the current day

### ✅ Task Management
- **Checkbox completion**: Mark tasks as done directly from any view
- **Hide completed**: Toggle to show/hide completed tasks
- **Priority levels**: Critical, High, Medium, Low with color-coded badges
- **Search**: Quickly filter tasks by text, tags, or priority
- **Tag grouping**: Organize tasks by tags in the sidebar
- **Smart filtering**: Sidebar shows only unscheduled tasks

### 🎨 Visual Customization
- **Tag-based colors**: Assign custom colors to tags for better organization
- **Color-coded tasks**: Visual distinction based on tag colors
- **Priority indicators**: Left border colors showing task priority
- **Drag preview**: See exactly where tasks will be placed while dragging

### ⏱️ Time Management
- **Duration tracking**: Set and visualize task duration
- **Resizable events**: Adjust duration with drag handles (top/bottom)
- **Time display**: Clear time and duration indicators on calendar events
- **Metadata support**: Date (📅), Time (🕐), and Duration (⏱) badges

### 🔄 Obsidian Tasks Integration
- Compatible with [Obsidian Tasks plugin](https://github.com/obsidian-tasks-group/obsidian-tasks) format
- Uses emoji-based metadata: `⏳ YYYY-MM-DD`, `⏰ HH:mm`, `⏱ Xmin`
- Preserves task format in your markdown files
- Direct file editing: Double-click tasks to jump to source file

## Installation

### From Obsidian Community Plugins (Coming Soon)
1. Open Settings → Community Plugins
2. Browse for "CalendTask"
3. Click Install, then Enable

### Manual Installation
1. Download `main.js`, `styles.css`, and `manifest.json` from the [latest release](https://github.com/SamiBaayoun/Calendtask/releases)
2. Create a folder `VaultFolder/.obsidian/plugins/calendtask/`
3. Copy the downloaded files into this folder
4. Reload Obsidian
5. Enable CalendTask in Settings → Community Plugins

## Usage

### Opening CalendTask
- Click the calendar icon in the left ribbon, or
- Use the command palette: "CalendTask: Open calendar view"

### Creating Tasks
Create tasks in any markdown file using the Obsidian Tasks format:
```markdown
- [ ] My task #tag ⏳ 2025-01-15 ⏰ 14:00 ⏱ 60min
- [ ] High priority task !high
- [ ] All-day event ⏳ 2025-01-15
```

### Scheduling Tasks
1. **From sidebar to calendar**: Drag unscheduled tasks onto time slots
2. **Within calendar**: Drag events to reschedule
3. **To all-day zone**: Drag events to the top "All-day" area
4. **Adjust duration**: Drag the top or bottom edge of calendar events

### Task Completion
- Click the checkbox on any task to mark it as done
- Use the eye icon (👁️) in the sidebar to hide/show completed tasks

### Customization
- **Tag colors**: Right-click any task → "Couleur pour #tag" → Choose a color
- **Collapse groups**: Click on tag headers to collapse/expand task groups
- **Search**: Use the search box in the sidebar to filter tasks

### Context Menu Options
Right-click on any task to:
- Change tag color
- Remove from calendar
- Open source file

## Task Format

CalendTask supports the following task metadata:

| Metadata | Format | Example | Description |
|----------|--------|---------|-------------|
| Date | `⏳ YYYY-MM-DD` | `⏳ 2025-01-15` | Schedule date |
| Time | `⏰ HH:mm` | `⏰ 14:30` | Start time |
| Duration | `⏱ Xmin` or `⏱ Xh` | `⏱ 90min` or `⏱ 1.5h` | Task duration |
| Priority | `!critical`, `!high`, `!medium`, `!low` | `!high` | Priority level |
| Tags | `#tagname` | `#work #urgent` | Task categorization |
| Status | `- [ ]` or `- [x]` | `- [x]` | Completion status |

## Development

### Prerequisites
- Node.js v16 or higher
- npm or yarn

### Setup
```bash
# Clone the repository
git clone https://github.com/SamiBaayoun/Calendtask.git
cd Calendtask

# Install dependencies
npm install

# Build in watch mode
npm run dev

# Production build
npm run build
```

### Project Structure
```
calendtask/
├── components/           # Svelte 5 components
│   ├── CalendarView.svelte
│   ├── TodoColumn.svelte
│   ├── TagGroup.svelte
│   └── AllDayZone.svelte
├── services/            # Business logic
│   ├── VaultSync.ts
│   └── TodoParser.ts
├── stores/              # Svelte stores
│   ├── todoStore.ts
│   └── uiStore.ts
├── utils/               # Utilities
│   ├── colors.ts
│   └── editorUtils.ts
├── main.ts              # Plugin entry point
└── styles.css           # Global styles
```

## Technology Stack
- **Framework**: Svelte 5 with runes
- **Language**: TypeScript
- **Build Tool**: esbuild
- **API**: Obsidian Plugin API

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

If you encounter any issues or have feature requests, please [open an issue](https://github.com/SamiBaayoun/Calendtask/issues) on GitHub.

---

Made with ❤️ for the Obsidian community
