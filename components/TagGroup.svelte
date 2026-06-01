<script lang="ts">
  import { getContext } from 'svelte';
  import { App, Menu } from 'obsidian';
  import TodoItem from './TodoItem.svelte';
  import type { TagGroup as TagGroupType, Todo, TodoColor } from '../types';
  import type { VaultSync } from '../services/VaultSync';
  import type CalendTaskPlugin from '../main';
  import { collapsedTags, toggleTagCollapsed, tagColors, setTagColor } from '../stores/uiStore';
  import { openTodoInEditor } from '../utils/editorUtils';
  import { TODO_COLORS, getTodoHueFromTags } from '../utils/colors';
  import { activeTimer } from '../stores/timerStore';

  export let group: TagGroupType;
  export let hideCompletedTodos: boolean = false;

  const app = getContext<App>('app');
  const vaultSync = getContext<VaultSync>('vaultSync');
  const plugin = getContext<CalendTaskPlugin>('plugin');
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
    event.stopPropagation();

    const menu = new Menu();

    // Option Timer (uniquement tâches non calendar-only)
    if (!todo.isCalendarOnly) {
      const hasTimer = $activeTimer?.todoId === todo.id;

      if (hasTimer) {
        if ($activeTimer?.isPaused) {
          // Option "Resume timer" avec icône play
          menu.addItem((item) => {
            item
              .setTitle('Resume timer')
              .setIcon('play')
              .onClick(async () => {
                await plugin.timerService.resumeCurrentTimer();
              });
          });
        } else {
          // Option "Pause timer" avec icône pause
          menu.addItem((item) => {
            item
              .setTitle('Pause timer')
              .setIcon('pause')
              .onClick(async () => {
                await plugin.timerService.pauseCurrentTimer();
              });
          });
        }

        // Option "Stop timer" avec icône square
        menu.addItem((item) => {
          item
            .setTitle('Stop timer')
            .setIcon('square')
            .onClick(async () => {
              await plugin.timerService.stopCurrentTimer();
            });
        });
      } else {
        // Option "Start timer" avec icône play
        menu.addItem((item) => {
          item
            .setTitle('Start timer')
            .setIcon('play')
            .onClick(async () => {
              await plugin.timerService.startTimerForTodo(todo);
            });
        });
      }

      menu.addSeparator();
    }

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
        {@const hue = getTodoHueFromTags(todo, $tagColors)}
        <TodoItem
          {todo}
          variant="sidebar"
          {hue}
          priorityClass={getPriorityClass(todo.priority)}
          showPriority={!!todo.priority}
          showMeta={true}
          showOpenArrow={true}
          onToggleStatus={handleToggleStatus}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
        />
      {/each}
    </div>
  {/if}
</div>

<style>
  .tag-group {
    padding-top: 8px;
    margin-top: 4px;
  }

  .tag-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 8px;
    background-color: transparent;
    border-radius: 6px;
    cursor: pointer;
    user-select: none;
    transition: background .12s;
  }

  .tag-header:hover {
    background-color: var(--background-modifier-hover);
  }

  .tag-toggle {
    flex-shrink: 0;
    font-size: .8em;
    color: var(--text-faint);
    transition: transform .2s ease;
  }

  .tag-name {
    flex-grow: 1;
    font-weight: 600;
    font-size: var(--ct-fs-ui, 0.875em);
    color: var(--text-normal);
  }

  .tag-name::before {
    content: '#';
    color: var(--text-muted);
  }

  .tag-count {
    margin-left: auto;
    color: var(--text-muted);
    font-size: var(--ct-fs-badge, 0.72em);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  .tag-todos {
    margin-top: 4px;
    padding-left: 6px;
    padding-bottom: 4px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
</style>
