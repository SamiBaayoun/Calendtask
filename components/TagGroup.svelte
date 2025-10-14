<script lang="ts">
  import { getContext } from 'svelte';
  import { App, Menu } from 'obsidian';
  import TodoItem from './TodoItem.svelte';
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

  // Filtrer les todos terminés si hideCompletedTodos est activé et trier alphabétiquement
  $: visibleTodos = (hideCompletedTodos
    ? group.todos.filter(todo => todo.status !== 'done')
    : group.todos).sort((a, b) => a.text.localeCompare(b.text, undefined, { sensitivity: 'base' }));

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

  function getPriorityClass(priority?: string): string {
    switch (priority) {
      case 'critical': return 'priority-critical';
      case 'high': return 'priority-high';
      case 'medium': return 'priority-medium';
      case 'low': return 'priority-low';
      default: return '';
    }
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
        <TodoItem
          {todo}
          variant="sidebar"
          {colors}
          priorityClass={getPriorityClass(todo.priority)}
          showPriority={!!todo.priority}
          showMeta={true}
          showOpenArrow={true}
          onToggleStatus={handleToggleStatus}
          onDoubleClick={handleDoubleClick}
          onDragStart={handleDragStart}
          onContextMenu={handleContextMenu}
        />
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
</style>
