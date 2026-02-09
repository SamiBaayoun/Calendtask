<script lang="ts">
  import { getContext } from 'svelte';
  import { App, Menu } from 'obsidian';
  import TodoItem from './TodoItem.svelte';
  import type { Todo } from '../types';
  import type { VaultSync } from '../services/VaultSync';
  import { todos as todosStore } from '../stores/todoStore';
  import { tagColors } from '../stores/uiStore';
  import { openTodoInEditor } from '../utils/editorUtils';
  import { getTodoColorFromTags } from '../utils/colors';

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
      // Error handling all-day drop
    }
  }

  async function handleEventDoubleClick(todo: Todo) {
    await openTodoInEditor(app, todo);
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

      // Calculer la largeur d'une cellule du calendrier
      // La grille calendrier = (largeur totale - 60px colonne temps) / 7 jours
      const calendarView = document.querySelector('.calendtask-calendar-view');
      let calendarCellWidth = 280; // Fallback
      if (calendarView) {
        const viewWidth = calendarView.clientWidth;
        calendarCellWidth = (viewWidth - 60) / 7; // 60px = largeur colonne temps
      }

      // Positionner hors écran mais visible pour le rendu
      ghost.style.position = 'fixed';
      ghost.style.top = '-9999px';
      ghost.style.left = '-9999px';
      ghost.style.width = `${calendarCellWidth}px`;
      ghost.style.maxWidth = `${calendarCellWidth}px`;
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
    event.stopPropagation();

    const menu = new Menu();

    menu.addItem((item) => {
      item
        .setTitle('Remove from calendar')
        .setIcon('calendar-x')
        .onClick(async () => {
          // Remove date, time and duration from todo
          await vaultSync.updateTodoInVault(todo, {
            date: undefined,
            time: undefined,
            duration: undefined
          });
        });
    });

    // Option "Open file" si la tâche a un fichier associé
    if (todo.filePath) {
      menu.addItem((item) => {
        item
          .setTitle('Open file')
          .setIcon('file-text')
          .onClick(async () => {
            await openTodoInEditor(app, todo);
          });
      });
    }

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
    <div class="all-day-placeholder">All day</div>
  {:else}
    {#each todos as todo (todo.id)}
      {@const colors = getTodoColorFromTags(todo, $tagColors)}
      <TodoItem
        {todo}
        variant="allday"
        {colors}
        showOpenArrow={true}
        onToggleStatus={handleToggleStatus}
        onDoubleClick={handleEventDoubleClick}
        onDragStart={handleEventDragStart}
        onContextMenu={handleEventContextMenu}
      />
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
</style>
