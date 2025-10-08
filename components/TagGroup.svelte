<script lang="ts">
  import { getContext } from 'svelte';
  import type { App } from 'obsidian';
  import type { TagGroup as TagGroupType, Todo } from '../types';
  import { collapsedTags, toggleTagCollapsed } from '../stores/uiStore';
  import { openTodoInEditor } from '../utils/editorUtils';

  export let group: TagGroupType;

  const app = getContext<App>('app');
  let isCollapsed = false;

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

  function handleDragStart(event: DragEvent, todo: Todo) {
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', JSON.stringify({ id: todo.id, text: todo.text }));

      // Créer une image fantôme
      const ghost = document.createElement('div');
      ghost.classList.add('todo-item-ghost');
      ghost.textContent = todo.text;
      document.body.appendChild(ghost);
      event.dataTransfer.setDragImage(ghost, 0, 0);
      setTimeout(() => document.body.removeChild(ghost), 0);
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

  function formatDateTime(todo: Todo): string {
    if (!todo.date) return '';

    const parts = [];

    // Date
    const date = new Date(todo.date);
    parts.push(`📅 ${date.getDate()}/${date.getMonth() + 1}`);

    // Heure
    if (todo.time) {
      parts.push(`⏰ ${todo.time}`);
    }

    // Durée
    if (todo.duration) {
      if (todo.duration >= 60) {
        const hours = Math.floor(todo.duration / 60);
        const minutes = todo.duration % 60;
        parts.push(minutes > 0 ? `⏱ ${hours}h${minutes}` : `⏱ ${hours}h`);
      } else {
        parts.push(`⏱ ${todo.duration}min`);
      }
    }

    return parts.join(' ');
  }
</script>

<div class="tag-group">
  <div class="tag-header" on:click={handleToggle} role="button" tabindex="0">
    <span class="tag-toggle">{isCollapsed ? '▶' : '▼'}</span>
    <span class="tag-name">
      {#if group.tag}
        🏷️ {group.tag}
      {:else}
        📋 Sans tag
      {/if}
    </span>
    <span class="tag-count">({group.todos.length})</span>
  </div>

  {#if !isCollapsed}
    <div class="tag-todos">
      {#each group.todos as todo (todo.id)}
        <div
          class="todo-item {getPriorityClass(todo.priority)}"
          draggable="true"
          on:dragstart={(e) => handleDragStart(e, todo)}
          on:dblclick={() => handleDoubleClick(todo)}
          role="listitem"
        >
          <div class="todo-main">
            {#if todo.priority}
              <span class="priority-badge">{getPriorityIcon(todo.priority)}</span>
            {/if}
            <span class="todo-text">{todo.text}</span>
          </div>
          {#if todo.date || todo.time || todo.duration}
            <div class="todo-meta">
              {formatDateTime(todo)}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .tag-group {
    margin-bottom: 10px;
  }

  .tag-header {
    display: flex;
    align-items: center;
    padding: 8px 10px;
    background-color: var(--background-secondary);
    border-radius: 4px;
    cursor: pointer;
    user-select: none;
    transition: background-color 0.1s;
  }

  .tag-header:hover {
    background-color: var(--background-modifier-hover);
  }

  .tag-toggle {
    margin-right: 8px;
    font-size: 0.8em;
    color: var(--text-muted);
  }

  .tag-name {
    flex-grow: 1;
    font-weight: 500;
  }

  .tag-count {
    color: var(--text-muted);
    font-size: 0.9em;
  }

  .tag-todos {
    margin-top: 5px;
    padding-left: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .todo-item {
    background-color: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-left: 3px solid var(--background-modifier-border);
    border-radius: 4px;
    padding: 8px 10px;
    cursor: grab;
  }

  .todo-item:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .todo-item:active {
    cursor: grabbing;
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

  .priority-badge {
    font-size: 0.75em;
    font-weight: bold;
    padding: 2px 4px;
    border-radius: 3px;
    background-color: var(--background-modifier-border);
  }

  .priority-critical .priority-badge {
    background-color: #ff4444;
    color: white;
  }

  .priority-high .priority-badge {
    background-color: #ff9800;
    color: white;
  }

  .priority-medium .priority-badge {
    background-color: #ffeb3b;
    color: #333;
  }

  .priority-low .priority-badge {
    background-color: #4caf50;
    color: white;
  }

  .todo-text {
    flex-grow: 1;
    font-size: 0.95em;
  }

  .todo-meta {
    margin-top: 4px;
    font-size: 0.75em;
    color: var(--text-muted);
    display: flex;
    gap: 8px;
  }
</style>
