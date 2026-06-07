<script lang="ts">
  import type { Todo } from '../types';
  import { activeTimer, timerElapsedTime, formatTimerDuration } from '../stores/timerStore';
  import { dragToCalendar } from '../utils/dragToCalendar';
  import type { DragTask } from '../stores/dragStore';

  // Props
  let {
    todo,
    variant = 'sidebar',
    hue,
    position = undefined,
    priorityClass = '',
    showPriority = false,
    showMeta = false,
    showOpenArrow = false,
    showResizeHandles = false,
    onToggleStatus = undefined,
    onDoubleClick = undefined,
    onDragStart = undefined,
    onContextMenu = undefined,
    onResizeMouseDown = undefined
  }: {
    todo: Todo;
    variant?: 'calendar' | 'allday' | 'sidebar';
    hue: number;
    position?: { top: number; height: number; column?: number; totalColumns?: number };
    priorityClass?: string;
    showPriority?: boolean;
    showMeta?: boolean;
    showOpenArrow?: boolean;
    showResizeHandles?: boolean;
    onToggleStatus?: (event: MouseEvent, todo: Todo) => void;
    onDoubleClick?: (todo: Todo) => void;
    onContextMenu?: (event: MouseEvent, todo: Todo) => void;
    onResizeMouseDown?: (event: MouseEvent, todo: Todo, type: 'top' | 'bottom') => void;
  } = $props();

  let dragTask = $derived<DragTask>({
    id: todo.id,
    title: todo.text,
    durationMinutes: todo.duration,
  });

  // Check if todo is calendar-only
  let isCalendarOnly = $derived(todo.isCalendarOnly === true);

  // Fonction pour obtenir l'icône de priorité
  function getPriorityIcon(priority?: string): string {
    switch (priority) {
      case 'critical': return '[C]';
      case 'high': return '[H]';
      case 'medium': return '[M]';
      case 'low': return '[L]';
      default: return '';
    }
  }

  // Fonction pour formater la date
  function formatDate(todo: Todo): string {
    if (!todo.date) return '';
    const date = new Date(todo.date);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return "Today";
    }

    if (date.toDateString() === tomorrow.toDateString()) {
      return "Tomorrow";
    }

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${date.getDate()} ${months[date.getMonth()]}`;
  }

  // Fonction pour formater la durée
  function formatDuration(duration: number): string {
    if (duration >= 60) {
      const hours = Math.floor(duration / 60);
      const minutes = duration % 60;
      return minutes > 0 ? `${hours}h${minutes}` : `${hours}h`;
    }
    return `${duration}min`;
  }

  // Compute class based on variant
  let itemClass = $derived(variant === 'calendar' ? 'calendar-event' :
                           variant === 'allday' ? 'all-day-event' :
                           'todo-item');

  let isShortEvent = $derived(variant === 'calendar' && position !== undefined && position.height <= 30);

  // Compute style — colours are passed as CSS custom properties so the
  // stylesheet decides where to apply them (calendar/allday only, not sidebar).
  let itemStyle = $derived(variant === 'calendar' && position
    ? (() => {
        const column = position.column ?? 0;
        const totalColumns = position.totalColumns ?? 1;
        const widthPercent = totalColumns > 1 ? (100 / totalColumns) : 100;
        const leftPercent = totalColumns > 1 ? (column * widthPercent) : 0;

        return `top: ${position.top}px; height: ${position.height}px; left: ${leftPercent}%; width: ${widthPercent}%; --ev-hue: ${hue};`;
      })()
    : `--ev-hue: ${hue};`);

  // Timer state
  let hasTimer = $derived($activeTimer?.todoId === todo.id);
  let isPaused = $derived($activeTimer?.isPaused === true);
  let timerDisplay = $derived(
    hasTimer ? formatTimerDuration($timerElapsedTime) : ''
  );

  // Resize logic for calendar events
  let currentCursor = $state('grab');

  function handleMouseMove(e: MouseEvent) {
    if (variant !== 'calendar' || !showResizeHandles) return;

    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;

    const resizeZone = 10; // 10px zone at top and bottom

    if (y <= resizeZone) {
      currentCursor = 'grabbing';
    } else if (y >= height - resizeZone) {
      currentCursor = 'grabbing';
    } else {
      currentCursor = 'grab';
    }
  }

  function handleMouseDown(e: MouseEvent) {
    if (variant !== 'calendar' || !showResizeHandles) return;

    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;

    const resizeZone = Math.min(14, Math.floor(height / 3));

    if (y <= resizeZone) {
      // Top resize
      e.stopPropagation();
      e.preventDefault();
      onResizeMouseDown?.(e, todo, 'top');
    } else if (y >= height - resizeZone) {
      // Bottom resize
      e.stopPropagation();
      e.preventDefault();
      onResizeMouseDown?.(e, todo, 'bottom');
    }
    // Otherwise, let drag happen normally
  }
</script>

<div
  class="{itemClass} {priorityClass}"
  class:completed={todo.status === 'done'}
  class:has-active-timer={hasTimer}
  class:short-event={isShortEvent}
  style="{itemStyle} cursor: {currentCursor};"
  use:dragToCalendar={dragTask}
  on:contextmenu={(e) => onContextMenu?.(e, todo)}
  on:mousemove={handleMouseMove}
  on:mousedown={handleMouseDown}
  role="listitem"
>
  <div class="item-content">
    {#if !isCalendarOnly}
      <input
        type="checkbox"
        class="item-checkbox"
        checked={todo.status === 'done'}
        on:click={(e) => onToggleStatus?.(e, todo)}
      />
    {/if}
    {#if showPriority && todo.priority}
      <span class="priority-badge">{getPriorityIcon(todo.priority)}</span>
    {/if}
    <span class="item-text" class:completed={todo.status === 'done'}>{todo.text}</span>
    {#if hasTimer && variant === 'sidebar'}
      <span class="timer-badge" class:paused={isPaused}>
        {#if isPaused}
          <span class="timer-icon">⏸️</span>
        {:else}
          <span class="timer-icon">▶️</span>
        {/if}
        <span class="timer-time">{timerDisplay}</span>
      </span>
    {/if}
    {#if showOpenArrow && !isCalendarOnly}
      <span class="open-file-arrow" on:click={(e) => { e.stopPropagation(); onDoubleClick?.(todo); }} role="button" tabindex="0">→</span>
    {/if}
  </div>

  {#if showMeta && (todo.date || todo.time || todo.duration)}
    <div class="todo-meta">
      {#if todo.date}
        <span class="meta-badge meta-date">📅 {formatDate(todo)}</span>
      {/if}
      {#if todo.time}
        <span class="meta-badge meta-time">🕐 {todo.time}</span>
      {/if}
      {#if todo.duration}
        <span class="meta-badge meta-duration">⏱ {formatDuration(todo.duration)}</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* ─── Priority tokens (local --prio var per priority class) ── */
  .priority-critical { --prio: var(--ct-priority-critical, #e05561); }
  .priority-high     { --prio: var(--ct-priority-high,     #d98a37); }
  .priority-medium   { --prio: var(--ct-priority-medium,   #c9a227); }
  .priority-low      { --prio: var(--ct-priority-low,      #4a9d6a); }

  /* ─── Sidebar todo item ──────────────────────────────────── */
  .todo-item {
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    /* Priority wins → tag colour → neutral border */
    border-left: 3px solid var(--prio, var(--ev-bg, var(--background-modifier-border)));
    border-radius: var(--ct-radius-sm, 6px);
    padding: 9px 11px;
    cursor: grab;
    transition: background .12s, border-color .12s;
  }

  .todo-item:hover {
    background: var(--background-modifier-hover);
  }

  .todo-item:active {
    cursor: grabbing;
  }

  .todo-item.completed {
    opacity: .7;
  }

  .todo-item.has-active-timer {
    border-left-color: var(--ct-timer-active, #22c55e) !important;
    border-left-width: 4px !important;
  }

  .todo-item.has-active-timer.paused {
    border-left-color: var(--ct-timer-paused, var(--text-faint)) !important;
  }

  /* ─── Calendar event ─────────────────────────────────────── */
  .calendar-event {
    margin: 1px;
    position: absolute;
    overflow: visible;
    z-index: 1;
    border-radius: var(--ct-radius-sm, 6px);
    padding: 5px 7px;
    font-size: 0.78em;
    font-weight: 500;
    background-color: var(--ev-bg);
    color: var(--ev-text);
    border-left: 3px solid rgba(0, 0, 0, .22);
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, .07);
    display: flex;
    flex-direction: column;
    cursor: grab;
    transition: box-shadow .12s;
  }

  .calendar-event:hover {
    box-shadow: 0 0 0 1.5px rgba(0, 0, 0, .25),
                inset 0 0 0 1px rgba(0, 0, 0, .1);
    z-index: 3;
  }

  .calendar-event.short-event {
    padding: 2px 5px;
    font-size: 0.68em;
  }

  .calendar-event.short-event .item-content {
    gap: 3px;
  }

  .calendar-event.short-event .item-text {
    -webkit-line-clamp: 2;
    line-height: 1.2;
  }

  .calendar-event.short-event .item-checkbox {
    width: 11px;
    height: 11px;
    flex-shrink: 0;
  }

  .calendar-event:active {
    cursor: grabbing;
  }

  .calendar-event.completed {
    opacity: .55;
  }

  .calendar-event.completed .item-text {
    text-decoration: line-through;
  }

  .calendar-event.just-dropped {
    animation: just-dropped .7s ease;
  }

  @keyframes just-dropped {
    from { box-shadow: 0 0 0 2px var(--interactive-accent); }
    to   { box-shadow: inset 0 0 0 1px rgba(0, 0, 0, .07); }
  }

  /* ─── All-day event ──────────────────────────────────────── */
  .all-day-event {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    font-size: 0.78em;
    border-radius: 4px;
    padding: 3px 8px;
    background-color: var(--ev-bg);
    color: var(--ev-text);
    border-left: 3px solid rgba(0, 0, 0, .22);
    transition: opacity .12s;
  }

  .all-day-event:hover {
    opacity: .9;
  }

  .all-day-event.completed {
    opacity: .6;
  }

  /* ─── Shared content layout ──────────────────────────────── */
  .item-content {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .calendar-event .item-content {
    overflow: hidden;
    min-height: 0;
    flex: 1;
    align-items: flex-start;
  }

  .all-day-event .item-content {
    flex: 1;
    min-width: 0;
    align-items: flex-start;
  }

  .todo-item .item-content {
    align-items: flex-start;
  }

  /* ─── Checkbox ───────────────────────────────────────────── */
  .item-checkbox {
    appearance: none;
    -webkit-appearance: none;
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    border-radius: 5px;
    border: 1.5px solid var(--text-faint);
    background-color: var(--background-primary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: border-color .12s, background .12s, transform .1s;
    position: relative;
  }

  .all-day-event .item-checkbox {
    width: 14px;
    height: 14px;
  }

  .todo-item .item-checkbox {
    margin-top: 2px;
  }

  .item-checkbox:hover {
    border-color: var(--interactive-accent);
    transform: scale(1.08);
  }

  .item-checkbox:checked {
    background-color: var(--interactive-accent);
    border-color: var(--interactive-accent);
  }

  .item-checkbox:checked::after {
    content: '✓';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: white;
    font-size: 11px;
    font-weight: bold;
  }

  .all-day-event .item-checkbox:checked::after {
    font-size: 9px;
  }

  /* ─── Text ───────────────────────────────────────────────── */
  .item-text {
    flex-grow: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .calendar-event .item-text {
    white-space: normal;
    word-wrap: break-word;
    overflow-wrap: break-word;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-height: 1.25;
    margin-top: 1px;
  }

  .all-day-event .item-text {
    white-space: normal;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  .todo-item .item-text {
    font-size: var(--ct-fs-small, 0.8em);
    line-height: 1.4;
    word-wrap: break-word;
    overflow-wrap: break-word;
    white-space: normal;
    color: var(--text-normal);
  }

  .item-text.completed {
    text-decoration: line-through;
    color: var(--text-muted);
  }

  /* ─── Priority badge ─────────────────────────────────────── */
  .priority-badge {
    font-size: 0;
    padding: 2px 6px;
    border-radius: 4px;
    white-space: nowrap;
    background: color-mix(in srgb, var(--prio, var(--text-muted)) 16%, transparent);
    flex-shrink: 0;
  }

  .priority-badge::after {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .3px;
    color: var(--prio, var(--text-muted));
  }

  .priority-critical .priority-badge::after { content: 'CRITICAL'; }
  .priority-high     .priority-badge::after { content: 'HIGH'; }
  .priority-medium   .priority-badge::after { content: 'MEDIUM'; }
  .priority-low      .priority-badge::after { content: 'LOW'; }

  /* ─── Meta badges (sidebar) ──────────────────────────────── */
  .todo-meta {
    margin-top: 6px;
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .meta-badge {
    font-size: 0.7em;
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: 500;
    white-space: nowrap;
    color: var(--text-muted);
    background-color: var(--background-modifier-border);
  }

  .meta-date     { background-color: color-mix(in srgb, #3b82f6 15%, transparent); color: var(--text-normal); }
  .meta-time     { background-color: color-mix(in srgb, #a855f7 15%, transparent); color: var(--text-normal); }
  .meta-duration { background-color: color-mix(in srgb, #22c55e 15%, transparent); color: var(--text-normal); }

  /* ─── Open file arrow ────────────────────────────────────── */
  .open-file-arrow {
    flex-shrink: 0;
    font-size: 1em;
    cursor: pointer;
    transition: transform .2s, opacity .12s;
    padding-left: 4px;
    user-select: none;
    opacity: 0;
    color: var(--text-faint);
  }

  .todo-item:hover .open-file-arrow {
    opacity: 1;
  }

  .all-day-event .open-file-arrow {
    font-size: .9em;
    opacity: 0;
  }

  .all-day-event:hover .open-file-arrow {
    opacity: 1;
  }

  .calendar-event:hover .open-file-arrow {
    opacity: 1;
  }

  .open-file-arrow:hover {
    transform: translateX(2px);
    color: var(--interactive-accent);
  }

  /* ─── Timer badge ────────────────────────────────────────── */
  .timer-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: 12px;
    font-size: .75em;
    font-weight: 600;
    background: var(--ct-timer-active, #22c55e);
    color: white;
    box-shadow: 0 2px 4px rgba(34, 197, 94, .3);
    animation: pulse-timer 2s ease-in-out infinite;
    flex-shrink: 0;
  }

  .timer-badge.paused {
    background: var(--ct-timer-paused, var(--text-faint));
    box-shadow: none;
    animation: none;
  }

  .timer-icon {
    font-size: .9em;
    line-height: 1;
  }

  .timer-time {
    font-variant-numeric: tabular-nums;
    letter-spacing: .5px;
  }

  @keyframes pulse-timer {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: .9; transform: scale(1.02); }
  }
</style>
