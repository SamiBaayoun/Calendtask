# CalendTask

An Obsidian plugin that adds a weekly calendar view to your vault. You can drag tasks from a sidebar onto time slots, resize them, and edit them — everything stays in your markdown files.

I built this because I wanted to see my tasks in a calendar without leaving Obsidian or syncing with an external service.

## What it does

The main view is a weekly grid with an "All-day" zone at the top and hourly slots below. Tasks without a scheduled time sit in a sidebar on the left, and you drag them onto the calendar when you're ready to place them.

A few things worth knowing:

- Tasks are stored as plain markdown — CalendTask reads and writes directly to your files using the [Obsidian Tasks](https://github.com/obsidian-tasks-group/obsidian-tasks) emoji format
- You can resize events by dragging the top or bottom edge
- Right-clicking a task lets you assign a color to its tag, which applies everywhere that tag appears
- Double-clicking a task opens the source file at that line

## Task format

```markdown
- [ ] Review PR #42 #work ⏳ 2025-01-15 ⏰ 14:00 ⏱ 45min
- [ ] Call dentist !high ⏳ 2025-01-15
- [x] Done task #personal ⏳ 2025-01-14
```

| Field | Syntax | Notes |
|-------|--------|-------|
| Date | `⏳ YYYY-MM-DD` | Required for the task to appear on the calendar |
| Time | `⏰ HH:mm` | Without this, goes to All-day zone |
| Duration | `⏱ 45min` or `⏱ 1.5h` | Defaults to 30min if not set |
| Priority | `!critical` `!high` `!medium` `!low` | Shows as a colored left border |
| Tags | `#tagname` | Used for grouping and color assignment |

## Installation

### Manual (for now)

1. Download `main.js`, `styles.css`, and `manifest.json` from the [latest release](https://github.com/SamiBaayoun/Calendtask/releases)
2. Create `.obsidian/plugins/calendtask/` in your vault
3. Copy the three files in
4. Reload Obsidian and enable the plugin in Settings → Community Plugins

Community plugin submission is planned once the plugin is more stable.

### Opening the view

Click the calendar icon in the left ribbon, or run `CalendTask: Open calendar view` from the command palette.

## Development

```bash
git clone https://github.com/SamiBaayoun/Calendtask.git
cd Calendtask
npm install
npm run dev   # watch mode
npm run build # production
```

Requires Node.js v16+.

Built with Svelte 5 (runes), TypeScript, and esbuild.

## Known issues / limitations

- No recurring task support yet
- Drag-and-drop can be finicky near the edges of the calendar grid on some screen sizes
- Tag color assignments are stored in plugin settings, not in the vault — they won't sync between devices via iCloud Drive

## Contributing

PRs welcome. If you find a bug, [open an issue](https://github.com/SamiBaayoun/Calendtask/issues) with a minimal reproduction if possible.

## Support

If CalendTask is useful to you: [buymeacoffee.com/sb2a](https://buymeacoffee.com/sb2a)

## License

MIT