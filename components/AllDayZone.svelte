<script lang="ts">
  import { getContext } from 'svelte';
  import { App, Menu } from 'obsidian';
  import type { Todo } from '../types';
  import type { VaultSync } from '../services/VaultSync';
  import { todos as todosStore } from '../stores/todoStore';
  import { openTodoInEditor } from '../utils/editorUtils';

  export let day: Date;
  export let todos: Todo[];
  export let hideLabel: boolean = false;

  const app = getContext<App>('app');
  const vaultSync = getContext<VaultSync>('vaultSync');

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
  }

  async function handleDrop(event: DragEvent) {
    event.preventDefault();
    const data = event.dataTransfer?.getData('text/plain');
    if (!data) return;

    try {
      const dragData = JSON.parse(data);
      const todoId = dragData.id;

      // Trouver le todo dans le store
      const todo = todosStore.subscribe(todos => {
        const foundTodo = todos.find(t => t.id === todoId);
        if (!foundTodo) return;

        // Format date (all-day = pas de time)
        const year = day.getFullYear();
        const month = String(day.getMonth() + 1).padStart(2, '0');
        const dayNum = String(day.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${dayNum}`;

        // Mettre à jour le todo dans le vault (all-day = pas de time)
        vaultSync.updateTodoInVault(foundTodo, {
          date: dateStr,
          time: undefined
        });
      });

      // Unsubscribe immediately
      todo();

    } catch (error) {
      console.error('Error handling all-day drop:', error);
    }
  }

  async function handleEventDoubleClick(todo: Todo) {
    await openTodoInEditor(app, todo);
  }

  function handleEventDragStart(event: DragEvent, todo: Todo) {
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', JSON.stringify({
        id: todo.id,
        text: todo.text,
        isCalendarEvent: true,
        isAllDay: true
      }));
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  async function handleEventContextMenu(event: MouseEvent, todo: Todo) {
    event.preventDefault();

    const menu = new Menu();

    menu.addItem((item) => {
      item
        .setTitle('Retirer du calendrier')
        .setIcon('calendar-x')
        .onClick(async () => {
          // Retirer la date du todo (all-day donc pas de time)
          await vaultSync.updateTodoInVault(todo, {
            date: undefined,
            time: undefined
          });
        });
    });

    menu.addItem((item) => {
      item
        .setTitle('Ouvrir le fichier')
        .setIcon('file-text')
        .onClick(async () => {
          await openTodoInEditor(app, todo);
        });
    });

    menu.addSeparator();

    menu.addItem((item) => {
      item
        .setTitle('Supprimer la tâche')
        .setIcon('trash')
        .onClick(async () => {
          // TODO: Implémenter la suppression complète du todo
          console.log('Delete todo:', todo.id);
        });
    });

    menu.showAtMouseEvent(event);
  }
</script>

<div
  class="all-day-zone"
  on:dragover={handleDragOver}
  on:drop={handleDrop}
  role="region"
  aria-label="All-day events for {day.toLocaleDateString()}"
>
  {#if todos.length === 0 && !hideLabel}
    <div class="all-day-placeholder">Toute la journée</div>
  {:else}
    {#each todos as todo (todo.id)}
      <div
        class="all-day-event"
        draggable="true"
        on:dragstart={(e) => handleEventDragStart(e, todo)}
        on:dblclick={() => handleEventDoubleClick(todo)}
        on:contextmenu={(e) => handleEventContextMenu(e, todo)}
      >
        {todo.text}
      </div>
    {/each}
  {/if}
</div>

<style>
  .all-day-zone {
    min-height: 40px;
    padding: 4px;
    background-color: var(--background-primary);
    border-bottom: 1px solid var(--background-modifier-border);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .all-day-placeholder {
    color: var(--text-faint);
    font-size: 0.75em;
    text-align: center;
    padding: 8px;
    font-style: italic;
  }

  .all-day-event {
    background-color: var(--interactive-accent);
    color: white;
    padding: 4px 8px;
    border-radius: 3px;
    font-size: 0.8em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }

  .all-day-event:hover {
    opacity: 0.9;
  }
</style>
