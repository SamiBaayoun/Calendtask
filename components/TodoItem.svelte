<script lang="ts">
  import type { Todo } from '../types';

  // Props
  export let todo: Todo;
  export let variant: 'calendar' | 'allday' | 'sidebar' = 'sidebar';
  export let colors: { bg: string; text: string };
  export let position: { top: number; height: number } | undefined = undefined;
  export let priorityClass: string = '';
  export let showPriority: boolean = false;
  export let showMeta: boolean = false;
  export let showOpenArrow: boolean = false;
  export let showResizeHandles: boolean = false;

  // Event handlers
  export let onToggleStatus: ((event: MouseEvent, todo: Todo) => void) | undefined = undefined;
  export let onDoubleClick: ((todo: Todo) => void) | undefined = undefined;
  export let onDragStart: ((event: DragEvent, todo: Todo) => void) | undefined = undefined;
  export let onContextMenu: ((event: MouseEvent, todo: Todo) => void) | undefined = undefined;
  export let onResizeMouseDown: ((event: MouseEvent, todo: Todo, type: 'top' | 'bottom') => void) | undefined = undefined;

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
  $: itemClass = variant === 'calendar' ? 'calendar-event' :
                 variant === 'allday' ? 'all-day-event' :
                 'todo-item';

  // Compute style
  $: itemStyle = variant === 'calendar' && position
    ? `top: ${position.top}px; height: ${position.height}px; background-color: ${colors.bg}; color: ${colors.text};`
    : `background-color: ${colors.bg}; color: ${colors.text};`;

  // Resize logic for calendar events
  let currentCursor = 'grab';

  function handleMouseMove(e: MouseEvent) {
    if (variant !== 'calendar' || !showResizeHandles) return;

    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;

    const resizeZone = 10; // 10px zone at top and bottom

    if (y <= resizeZone) {
      currentCursor = 'ns-resize';
    } else if (y >= height - resizeZone) {
      currentCursor = 'ns-resize';
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

    const resizeZone = 10;

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
  style="{itemStyle} cursor: {currentCursor};"
  draggable="true"
  on:dragstart={(e) => onDragStart?.(e, todo)}
  on:contextmenu={(e) => onContextMenu?.(e, todo)}
  on:mousemove={handleMouseMove}
  on:mousedown={handleMouseDown}
  role="listitem"
>
  <div class="item-content">
    <input
      type="checkbox"
      class="item-checkbox"
      checked={todo.status === 'done'}
      on:click={(e) => onToggleStatus?.(e, todo)}
    />
    {#if showPriority && todo.priority}
      <span class="priority-badge">{getPriorityIcon(todo.priority)}</span>
    {/if}
    <span class="item-text" class:completed={todo.status === 'done'}>{todo.text}</span>
    {#if showOpenArrow}
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
  /* Base styles */
  .calendar-event,
  .all-day-event,
  .todo-item {
    border-radius: 6px;
    padding: 6px 8px;
    font-size: 0.8em;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  /* Calendar event specific */
  .calendar-event {
    margin: 2px;
    position: absolute;
    width: calc(100% - 4px);
    overflow: hidden;
    z-index: 1;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
    border-left: 3px solid rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
  }

  .calendar-event:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
    z-index: 2;
    filter: brightness(0.95);
  }

  .calendar-event:active {
    cursor: grabbing;
  }

  /* All-day event specific */
  .all-day-event {
    font-size: 0.8em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border-radius: 3px;
    padding: 4px 8px;
  }

  .all-day-event:hover {
    opacity: 0.9;
  }

  /* Todo item (sidebar) specific */
  .todo-item {
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-left: 3px solid rgba(0, 0, 0, 0.2);
    border-radius: 6px;
    padding: 10px 12px;
    cursor: grab;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  }

  .todo-item:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    transform: translateY(-1px);
    filter: brightness(0.95);
  }

  .todo-item:active {
    cursor: grabbing;
    transform: translateY(0);
  }

  /* Priority colors for sidebar */
  .todo-item.priority-critical {
    border-left-color: #ff4444;
  }

  .todo-item.priority-high {
    border-left-color: #ff9800;
  }

  .todo-item.priority-medium {
    border-left-color: #ffeb3b;
  }

  .todo-item.priority-low {
    border-left-color: #4caf50;
  }

  /* Completed state */
  .calendar-event.completed,
  .all-day-event.completed {
    opacity: 0.6;
  }

  /* Content layout */
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

  .todo-item .item-content {
    align-items: flex-start;
  }

  /* Checkbox */
  .item-checkbox {
    appearance: none;
    -webkit-appearance: none;
    width: 18px;
    height: 18px;
    cursor: pointer;
    flex-shrink: 0;
    border-radius: 3px;
    border: 1px solid var(--text-normal);
    background-color: var(--background-primary);
    transition: all 0.15s ease;
    position: relative;
  }

  .all-day-event .item-checkbox {
    width: 16px;
    height: 16px;
  }

  .todo-item .item-checkbox {
    margin-top: 2px;
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
    font-size: 12px;
    font-weight: bold;
  }

  .all-day-event .item-checkbox:checked::after {
    font-size: 11px;
  }

  .item-checkbox:hover {
    border-color: var(--interactive-accent);
    transform: scale(1.1);
  }

  /* Text */
  .item-text {
    flex-grow: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .calendar-event .item-text {
    /* Allow text wrapping that adapts to available height */
    white-space: normal;
    word-wrap: break-word;
    overflow-wrap: break-word;
    /* Use webkit line clamp to truncate with ellipsis if text exceeds height */
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 10; /* Max lines before truncating */
    line-height: 1.3;
  }

  .all-day-event .item-text {
    white-space: nowrap;
  }

  .todo-item .item-text {
    font-size: 0.9em;
    line-height: 1.4;
    word-wrap: break-word;
    overflow-wrap: break-word;
    white-space: normal;
  }

  .item-text.completed {
    text-decoration: line-through;
  }

  .todo-item .item-text.completed {
    opacity: 0.6;
  }

  /* Priority badge (sidebar only) */
  .priority-badge {
    font-size: 0.7em;
    font-weight: 700;
    padding: 3px 6px;
    border-radius: 4px;
    background-color: var(--background-modifier-border);
    letter-spacing: 0.3px;
  }

  .priority-critical .priority-badge {
    background-color: #ff4444;
    color: white;
    box-shadow: 0 1px 3px rgba(255, 68, 68, 0.3);
  }

  .priority-high .priority-badge {
    background-color: #ff9800;
    color: white;
    box-shadow: 0 1px 3px rgba(255, 152, 0, 0.3);
  }

  .priority-medium .priority-badge {
    background-color: #ffeb3b;
    color: #333;
    box-shadow: 0 1px 3px rgba(255, 235, 59, 0.3);
  }

  .priority-low .priority-badge {
    background-color: #4caf50;
    color: white;
    box-shadow: 0 1px 3px rgba(76, 175, 80, 0.3);
  }

  /* Meta badges (sidebar only) */
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
    background-color: rgba(0, 0, 0, 0.1);
    white-space: nowrap;
  }

  .meta-date {
    background-color: rgba(59, 130, 246, 0.15);
  }

  .meta-time {
    background-color: rgba(168, 85, 247, 0.15);
  }

  .meta-duration {
    background-color: rgba(34, 197, 94, 0.15);
  }

  /* Open file arrow */
  .open-file-arrow {
    flex-shrink: 0;
    font-size: 1.1em;
    cursor: pointer;
    transition: all 0.2s ease;
    padding-left: 4px;
    user-select: none;
  }

  .all-day-event .open-file-arrow {
    font-size: 0.9em;
  }

  .open-file-arrow:hover {
    transform: translateX(2px);
  }
</style>
