<script lang="ts">
  import { getContext } from 'svelte';
  import { App, Menu } from 'obsidian';
  import type { TagGroup as TagGroupType, Todo, TodoColor } from '../types';
  import type { VaultSync } from '../services/VaultSync';
  import { collapsedTags, toggleTagCollapsed, tagColors, setTagColor } from '../stores/uiStore';
  import { openTodoInEditor } from '../utils/editorUtils';
  import { TODO_COLORS, getTodoColorFromTags } from '../utils/colors';

  export let group: TagGroupType;
  export let hideCompletedTodos: boolean = false;

  const app = getContext<App>('app');
  const vaultSync = getContext<VaultSync>('vaultSync');
  let isCollapsed = false;

  // Filtrer les todos terminés si hideCompletedTodos est activé
  $: visibleTodos = hideCompletedTodos
    ? group.todos.filter(todo => todo.status !== 'done')
    : group.todos;

  // S'abonner aux tags collapsed
  collapsedTags.subscribe(tags => {
    isCollapsed = tags.has(group.tag);
  });

  function handleToggle() {
    toggleTagCollapsed(group.tag);
  }

  async function handleDoubleClick(todo: Todo) {
    await openTodoInEditor(app, todo);
  }

  async function handleContextMenu(event: MouseEvent, todo: Todo) {
    event.preventDefault();

    const menu = new Menu();

    // Submenu to change color (for tag or "No tag")
    menu.addItem((item) => {
      const tagToColor = todo.tags && todo.tags.length > 0 ? todo.tags[0] : '';
      const submenu = item
        .setTitle(tagToColor ? `Color for #${tagToColor}` : 'Color (No tag)')
        .setIcon('palette');

      // Ajouter chaque couleur comme sous-élément
      Object.entries(TODO_COLORS).forEach(([colorKey, colorData]) => {
        (item as any).setSubmenu().addItem((subItem: any) => {
          subItem
            .setTitle(colorData.name)
            .onClick(() => {
              setTagColor(tagToColor, colorKey as TodoColor);
            });
        });
      });
    });

    menu.addSeparator();

    menu.addItem((item) => {
      item
        .setTitle('Open file')
        .setIcon('file-text')
        .onClick(async () => {
          await openTodoInEditor(app, todo);
        });
    });

    menu.showAtMouseEvent(event);
  }

  function handleDragStart(event: DragEvent, todo: Todo) {
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', JSON.stringify({ id: todo.id, text: todo.text }));

      // Cloner l'élément actuel pour l'image fantôme
      const target = event.currentTarget as HTMLElement;
      const ghost = target.cloneNode(true) as HTMLElement;

      // Positionner hors écran mais visible pour le rendu
      ghost.style.position = 'fixed';
      ghost.style.top = '-9999px';
      ghost.style.left = '-9999px';
      ghost.style.width = '280px';
      ghost.style.maxWidth = '280px';
      ghost.style.opacity = '0.85';
      ghost.style.pointerEvents = 'none';
      ghost.style.zIndex = '10000';
      ghost.style.transform = 'none';
      ghost.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.25)';

      document.body.appendChild(ghost);

      // Utiliser l'élément comme drag image
      event.dataTransfer.setDragImage(ghost, 20, 20);

      // Nettoyer après un court délai
      setTimeout(() => {
        if (ghost.parentNode) {
          document.body.removeChild(ghost);
        }
      }, 50);
    }
  }

  function getPriorityIcon(priority?: string): string {
    switch (priority) {
      case 'critical': return '[C]';
      case 'high': return '[H]';
      case 'medium': return '[M]';
      case 'low': return '[L]';
      default: return '';
    }
  }

  function getPriorityClass(priority?: string): string {
    switch (priority) {
      case 'critical': return 'priority-critical';
      case 'high': return 'priority-high';
      case 'medium': return 'priority-medium';
      case 'low': return 'priority-low';
      default: return '';
    }
  }

  function formatDate(todo: Todo): string {
    if (!todo.date) return '';
    const date = new Date(todo.date);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Check if today
    if (date.toDateString() === today.toDateString()) {
      return "Today";
    }

    // Check if tomorrow
    if (date.toDateString() === tomorrow.toDateString()) {
      return "Tomorrow";
    }

    // Otherwise show date
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${date.getDate()} ${months[date.getMonth()]}`;
  }

  function formatDuration(duration: number): string {
    if (duration >= 60) {
      const hours = Math.floor(duration / 60);
      const minutes = duration % 60;
      return minutes > 0 ? `${hours}h${minutes}` : `${hours}h`;
    }
    return `${duration}min`;
  }

  async function handleToggleStatus(event: MouseEvent, todo: Todo) {
    event.preventDefault(); // Prevent default checkbox behavior
    event.stopPropagation(); // Empêcher le drag

    // Basculer entre 'todo' et 'done'
    const newStatus = todo.status === 'done' ? 'todo' : 'done';

    await vaultSync.updateTodoInVault(todo, {
      status: newStatus
    });
  }
</script>

<div class="tag-group">
  <div class="tag-header" on:click={handleToggle} role="button" tabindex="0">
    <span class="tag-toggle">{isCollapsed ? '▶' : '▼'}</span>
    <span class="tag-name">
      {#if group.tag}
        {group.tag}
      {:else}
        No tag
      {/if}
    </span>
    <span class="tag-count">({visibleTodos.length})</span>
  </div>

  {#if !isCollapsed}
    <div class="tag-todos">
      {#each visibleTodos as todo (todo.id)}
        {@const colors = getTodoColorFromTags(todo, $tagColors)}
        <div
          class="todo-item {getPriorityClass(todo.priority)}"
          style="background-color: {colors.bg}; color: {colors.text};"
          draggable="true"
          on:dragstart={(e) => handleDragStart(e, todo)}
          on:dblclick={() => handleDoubleClick(todo)}
          on:contextmenu={(e) => handleContextMenu(e, todo)}
          role="listitem"
        >
          <div class="todo-main">
            <input
              type="checkbox"
              class="todo-checkbox"
              checked={todo.status === 'done'}
              on:click={(e) => handleToggleStatus(e, todo)}
            />
            {#if todo.priority}
              <span class="priority-badge">{getPriorityIcon(todo.priority)}</span>
            {/if}
            <span class="todo-text" class:completed={todo.status === 'done'}>{todo.text}</span>
          </div>
          {#if todo.date || todo.time || todo.duration}
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
      {/each}
    </div>
  {/if}
</div>

<style>
  .tag-group {
    margin-bottom: 12px;
  }

  .tag-header {
    display: flex;
    align-items: center;
    padding: 10px 12px;
    background-color: transparent;
    border-radius: 6px;
    cursor: pointer;
    user-select: none;
    transition: all 0.15s ease;
  }

  .tag-header:hover {
    background-color: var(--background-modifier-hover);
  }

  .tag-toggle {
    margin-right: 10px;
    font-size: 0.75em;
    color: var(--text-muted);
    transition: transform 0.15s ease;
  }

  .tag-name {
    flex-grow: 1;
    font-weight: 600;
    font-size: 0.9em;
  }

  .tag-count {
    color: var(--text-muted);
    font-size: 0.85em;
    font-weight: 500;
    background-color: var(--background-modifier-border);
    padding: 2px 8px;
    border-radius: 12px;
  }

  .tag-todos {
    margin-top: 8px;
    padding-left: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .todo-item {
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-left: 3px solid rgba(0, 0, 0, 0.2);
    border-radius: 6px;
    padding: 10px 12px;
    cursor: grab;
    transition: all 0.15s ease;
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

  /* Priority colors */
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

  .todo-main {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .todo-checkbox {
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

  .todo-checkbox:checked {
    background-color: var(--interactive-accent);
    border-color: var(--interactive-accent);
  }

  .todo-checkbox:checked::after {
    content: '✓';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: white;
    font-size: 12px;
    font-weight: bold;
  }

  .todo-checkbox:hover {
    border-color: var(--interactive-accent);
    transform: scale(1.1);
  }

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

  .todo-text {
    flex-grow: 1;
    font-size: 0.9em;
    line-height: 1.4;
    transition: all 0.2s ease;
  }

  .todo-text.completed {
    text-decoration: line-through;
    opacity: 0.6;
  }

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
</style>
