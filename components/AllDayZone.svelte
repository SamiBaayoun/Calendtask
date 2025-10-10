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
      const foundTodo = $todosStore.find(t => t.id === todoId);
      if (!foundTodo) return;

      // Format date (all-day = pas de time ni duration)
      const year = day.getFullYear();
      const month = String(day.getMonth() + 1).padStart(2, '0');
      const dayNum = String(day.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${dayNum}`;

      // Mettre à jour le todo dans le vault (all-day = pas de time ni duration)
      await vaultSync.updateTodoInVault(foundTodo, {
        date: dateStr,
        time: undefined,
        duration: undefined
      });

    } catch (error) {
      console.error('Error handling all-day drop:', error);
    }
  }

  async function handleEventDoubleClick(todo: Todo) {
    await openTodoInEditor(app, todo);
  }

  async function handleToggleStatus(event: MouseEvent, todo: Todo) {
    event.stopPropagation(); // Empêcher le drag

    // Basculer entre 'todo' et 'done'
    const newStatus = todo.status === 'done' ? 'todo' : 'done';

    await vaultSync.updateTodoInVault(todo, {
      status: newStatus
    });
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

      // Créer une image fantôme pour les événements all-day
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

  async function handleEventContextMenu(event: MouseEvent, todo: Todo) {
    event.preventDefault();

    const menu = new Menu();

    menu.addItem((item) => {
      item
        .setTitle('Retirer du calendrier')
        .setIcon('calendar-x')
        .onClick(async () => {
          // Retirer la date, l'heure et la durée du todo
          await vaultSync.updateTodoInVault(todo, {
            date: undefined,
            time: undefined,
            duration: undefined
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
        class:completed={todo.status === 'done'}
        draggable="true"
        on:dragstart={(e) => handleEventDragStart(e, todo)}
        on:dblclick={() => handleEventDoubleClick(todo)}
        on:contextmenu={(e) => handleEventContextMenu(e, todo)}
      >
        <input
          type="checkbox"
          class="allday-checkbox"
          checked={todo.status === 'done'}
          on:click={(e) => handleToggleStatus(e, todo)}
        />
        <span class="allday-text">{todo.text}</span>
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
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .all-day-event:hover {
    opacity: 0.9;
  }

  .all-day-event.completed {
    opacity: 0.6;
  }

  .allday-checkbox {
    width: 14px;
    height: 14px;
    cursor: pointer;
    flex-shrink: 0;
    border-radius: 2px;
    border: 1.5px solid rgba(255, 255, 255, 0.6);
    background-color: transparent;
    transition: all 0.15s ease;
  }

  .allday-checkbox:checked {
    background-color: rgba(255, 255, 255, 0.9);
    border-color: rgba(255, 255, 255, 0.9);
  }

  .allday-checkbox:hover {
    transform: scale(1.15);
    border-color: rgba(255, 255, 255, 0.9);
  }

  .allday-text {
    flex-grow: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .all-day-event.completed .allday-text {
    text-decoration: line-through;
  }
</style>
