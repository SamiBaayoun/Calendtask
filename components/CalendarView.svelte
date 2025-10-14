<script lang="ts">
  import { onMount, getContext, mount, unmount } from 'svelte';
  import { App, Menu } from 'obsidian';
  import AllDayZone from './AllDayZone.svelte';
  import TodoItem from './TodoItem.svelte';
  import CreateTodoModal from './CreateTodoModal.svelte';
  import {
    currentWeekStart,
    daysInWeek,
    goToPreviousWeek,
    goToNextWeek,
    goToToday
  } from '../stores/calendarStore';
  import { todos, calendarOnlyTodos } from '../stores/todoStore';
  import { tagColors, setTagColor } from '../stores/uiStore';
  import type { Todo, TodoColor } from '../types';
  import type { VaultSync } from '../services/VaultSync';
  import type CalendTaskPlugin from '../main';
  import { openTodoInEditor } from '../utils/editorUtils';
  import { TODO_COLORS, getTodoColorFromTags } from '../utils/colors';
  import { CalendarTodoService } from '../services/CalendarTodoService';

  const app = getContext<App>('app');
  const vaultSync = getContext<VaultSync>('vaultSync');
  const plugin = getContext<CalendTaskPlugin>('plugin');
  const hours = Array.from({ length: 24 }, (_, i) => i);

  // Événements pour le resize et drag
  let isResizing = $state(false);
  let resizeEventId = $state<string | null>(null);
  let resizeTodo = $state<Todo | null>(null);
  let initialY = 0;
  let initialDuration = 0;
  let initialTime: string | null = null;
  let resizeHandleType: 'top' | 'bottom' | null = null;

  // Local state for visual resize feedback (not saved to store until mouseup)
  let resizeVisualState = $state<{ time?: string; duration?: number } | null>(null);

  // Drag & drop states
  let draggedOverCell = $state<{ dayIndex: number; hour: number } | null>(null);
  let dropPreview = $state<{ dayIndex: number; hour: number; offsetY: number; todo: Todo } | null>(null);

  // Modal state
  let showCreateModal = $state(false);
  let modalDate = $state('');
  let modalTime = $state('');
  let modalContainer: HTMLElement | null = null;

  // Current time indicator state
  let currentTimePosition = $state(0);
  let todayDayIndex = $state(-1);
  let currentTimeString = $state('');

  // Helper function to get the effective time for a todo (considers resize state)
  function getEffectiveTime(todo: Todo): string | undefined {
    // If this todo is being resized and we have a new time in visual state
    if (isResizing && resizeEventId === todo.id && resizeVisualState?.time) {
      return resizeVisualState.time;
    }
    // Otherwise, return the normal time from store
    return todo.time;
  }

  // Pre-compute todos by day+hour for efficient rendering (replaces 175 filters per render)
  let todosByDayHour = $derived.by(() => {
    const byHour = new Map<string, Todo[]>();
    const byDay = new Map<string, Todo[]>();

    $todos.forEach(todo => {
      if (!todo.date) return;

      // Get effective time (considers resize state)
      const effectiveTime = getEffectiveTime(todo);

      // All-day todos (no time)
      if (!effectiveTime) {
        const key = todo.date;
        if (!byDay.has(key)) byDay.set(key, []);
        byDay.get(key)!.push(todo);
        return;
      }

      // Timed todos - use effective time for indexing
      const [hours] = effectiveTime.split(':').map(Number);
      const key = `${todo.date}-${hours}`;
      if (!byHour.has(key)) byHour.set(key, []);
      byHour.get(key)!.push(todo);
    });

    return { byHour, byDay };
  });

  // Pre-compute day metadata to avoid repeated calculations (189 → 7 per render)
  let daysMetadata = $derived($daysInWeek.map(day => {
    const today = new Date();
    const isToday = day.getDate() === today.getDate() &&
                    day.getMonth() === today.getMonth() &&
                    day.getFullYear() === today.getFullYear();

    return {
      date: day,
      isToday,
      weekday: day.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNumber: day.getDate(),
      timestamp: day.getTime()
    };
  }));

  // Update current time indicator position
  function updateCurrentTime() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();

    // Calculate position: (hours * 60px) + (minutes/60 * 60px)
    // No offset needed since time indicator is in the same scrollable container
    currentTimePosition = (hours * 60) + (minutes / 60 * 60);

    // Format current time as HH:MM
    currentTimeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

    // Find today's day index in the current week
    const today = new Date();
    todayDayIndex = $daysInWeek.findIndex(day =>
      day.getDate() === today.getDate() &&
      day.getMonth() === today.getMonth() &&
      day.getFullYear() === today.getFullYear()
    );
  }

  onMount(() => {
    // Initialize current time position
    updateCurrentTime();

    // Update every minute
    const timeInterval = setInterval(updateCurrentTime, 60000);

    // Cleanup on unmount (mouseup listener is added/removed dynamically)
    return () => {
      clearInterval(timeInterval);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  });


  function handleDragOver(event: DragEvent, dayIndex: number, hour: number) {
    event.preventDefault();
    draggedOverCell = { dayIndex, hour };

    // Essayer de récupérer le todo pour créer un preview
    const data = event.dataTransfer?.getData('text/plain');
    if (data) {
      try {
        const dragData = JSON.parse(data);
        const todo = $todos.find(t => t.id === dragData.id);
        if (todo) {
          const offsetY = event.offsetY || 0;
          dropPreview = { dayIndex, hour, offsetY, todo };
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }
  }

  function handleDragLeave() {
    draggedOverCell = null;
    dropPreview = null;
  }

  async function handleDrop(event: DragEvent, day: Date, hour: number) {
    event.preventDefault();

    // Nettoyer les états de drag
    draggedOverCell = null;
    dropPreview = null;

    const data = event.dataTransfer?.getData('text/plain');
    if (!data) return;

    try {
      const dragData = JSON.parse(data);
      const todoId = dragData.id;

      // Trouver le todo dans le store
      const todo = $todos.find(t => t.id === todoId);
      if (!todo) return;

      // Toujours commencer au début de l'heure
      const finalMinutes = 0;
      const finalHour = hour;

      // Vérifier que l'événement ne dépasse pas 23:59
      const duration = todo.duration || 30;
      const startMinutes = finalHour * 60 + finalMinutes;
      const endMinutes = startMinutes + duration;

      // Si l'événement dépasse minuit, annuler le drop
      if (endMinutes > 1439) {
        console.warn('Cannot drop event: would extend past 23:59');
        return;
      }

      // Format date et time
      const dateStr = formatDate(day);
      const timeStr = `${String(finalHour).padStart(2, '0')}:${String(finalMinutes).padStart(2, '0')}`;

      // Check if it's a calendar-only todo
      const isCalendarOnly = CalendarTodoService.isCalendarOnly(todo);

      if (isCalendarOnly) {
        // Update calendar-only todo in JSON
        calendarOnlyTodos.update(currentTodos => {
          return currentTodos.map(t =>
            t.id === todo.id ? { ...t, date: dateStr, time: timeStr } : t
          );
        });

        // Save to plugin data
        await plugin.updateCalendarOnlyTodo(todo.id, {
          date: dateStr,
          time: timeStr
        });
      } else {
        // Update vault todo in file
        await vaultSync.updateTodoInVault(todo, {
          date: dateStr,
          time: timeStr
        });
      }

    } catch (error) {
      console.error('Error handling drop:', error);
    }
  }

  // Calculer la position du preview pendant le drag
  function getPreviewPosition(preview: typeof dropPreview): { top: number; height: number; time: string } | null {
    if (!preview) return null;

    // Toujours commencer au début de l'heure
    const cellHeight = 60;
    const finalMinutes = 0;
    const finalHour = preview.hour;

    const top = 0; // Toujours au début de la cellule
    const duration = preview.todo.duration || 30;
    const height = (duration / 60) * cellHeight;

    const timeStr = `${String(finalHour).padStart(2, '0')}:${String(finalMinutes).padStart(2, '0')}`;

    return { top, height, time: timeStr };
  }

  function handleMouseDown(event: MouseEvent, todo: Todo, type: 'top' | 'bottom') {
    isResizing = true;
    resizeEventId = todo.id;
    resizeTodo = todo;
    initialY = event.clientY;
    initialDuration = todo.duration || 30;
    initialTime = todo.time || null;
    resizeHandleType = type;

    // Initialize visual state with current values to prevent jump
    resizeVisualState = {
      time: todo.time,
      duration: todo.duration || 30
    };

    event.stopPropagation();
    event.preventDefault();

    // Attach listeners only when needed
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }

  function handleMouseMove(event: MouseEvent) {
    if (!isResizing || !resizeEventId || !resizeTodo || !initialTime) return;

    const deltaY = event.clientY - initialY;
    const cellHeight = 60; // 60px par heure
    // Ne pas arrondir le delta, garder la précision
    const deltaMinutes = (deltaY / cellHeight) * 60;

    if (resizeHandleType === 'bottom') {
      // Resize depuis le bas : augmenter/diminuer la durée
      let newDuration = Math.max(15, initialDuration + deltaMinutes); // Min 15 minutes
      // Snap to 15-minute increments (arrondir la durée finale, pas le delta)
      newDuration = Math.round(newDuration / 15) * 15;

      // Vérifier que l'événement ne dépasse pas 23:59
      const [hours, minutes] = initialTime.split(':').map(Number);
      const startMinutes = hours * 60 + minutes;
      const endMinutes = startMinutes + newDuration;

      // Limite à 23:59 (1439 minutes depuis minuit)
      if (endMinutes > 1439) {
        newDuration = 1439 - startMinutes;
      }

      // Store in local state only (no store update = no re-render)
      resizeVisualState = { duration: newDuration };

    } else if (resizeHandleType === 'top') {
      // Resize depuis le haut : déplacer l'heure de début ET ajuster la durée
      const [hours, minutes] = initialTime.split(':').map(Number);
      const initialMinutesFromMidnight = hours * 60 + minutes;

      // Calculer la nouvelle heure de début
      let newStartMinutes = initialMinutesFromMidnight + deltaMinutes;
      // Snap to 15-minute increments
      newStartMinutes = Math.round(newStartMinutes / 15) * 15;

      // Calculer la fin (qui reste fixe)
      const endMinutes = initialMinutesFromMidnight + initialDuration;

      // Calculer la nouvelle durée
      let newDuration = endMinutes - newStartMinutes;

      // Minimum 15 minutes
      if (newDuration < 15) {
        newDuration = 15;
        newStartMinutes = endMinutes - 15;
      }

      // Calculer la nouvelle heure
      const newHours = Math.floor(newStartMinutes / 60);
      const newMinutes = newStartMinutes % 60;

      // Vérifier les limites (0:00 à 23:59)
      if (newHours >= 0 && newHours < 24 && endMinutes <= 1439) {
        const newTime = `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
        // Store in local state only (no store update = no re-render)
        resizeVisualState = { time: newTime, duration: newDuration };
      }
    }
  }

  async function handleMouseUp() {
    if (isResizing && resizeTodo && resizeVisualState) {
      // Apply changes from visual state to store and save
      const updates: Partial<Todo> = {};

      if (resizeVisualState.time && resizeVisualState.time !== initialTime) {
        updates.time = resizeVisualState.time;
      }

      if (resizeVisualState.duration && resizeVisualState.duration !== initialDuration) {
        updates.duration = resizeVisualState.duration;
      }

      if (Object.keys(updates).length > 0) {
        const isCalendarOnly = CalendarTodoService.isCalendarOnly(resizeTodo);

        if (isCalendarOnly) {
          // Update calendar-only todo in JSON
          calendarOnlyTodos.update(currentTodos => {
            return currentTodos.map(t =>
              t.id === resizeTodo.id ? { ...t, ...updates } : t
            );
          });

          // Save to plugin data
          await plugin.updateCalendarOnlyTodo(resizeTodo.id, updates);
        } else {
          // Save vault todo to file (VaultSync will handle the store update)
          await vaultSync.updateTodoInVault(resizeTodo, updates);
        }
      }
    }

    // Reset state AFTER store update (reset even if no updates)
    isResizing = false;
    resizeEventId = null;
    resizeTodo = null;
    initialTime = null;
    resizeHandleType = null;
    resizeVisualState = null;

    // Detach listeners when done
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
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
    // Ne pas permettre le drag si on est en train de resize
    if (isResizing) {
      event.preventDefault();
      return;
    }

    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', JSON.stringify({
        id: todo.id,
        text: todo.text,
        isCalendarEvent: true
      }));
      event.dataTransfer.effectAllowed = 'move';

      // Créer une image fantôme pour les événements du calendrier
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
      ghost.style.height = 'auto';
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
    const isCalendarOnly = CalendarTodoService.isCalendarOnly(todo);

    // Sous-menu pour changer la couleur
    menu.addItem((item) => {
      if (isCalendarOnly) {
        // Pour les todos calendar-only : changer la couleur du todo directement
        const submenu = item
          .setTitle('Couleur')
          .setIcon('palette');

        // Ajouter chaque couleur comme sous-élément
        Object.entries(TODO_COLORS).forEach(([colorKey, colorData]) => {
          (item as any).setSubmenu().addItem((subItem: any) => {
            subItem
              .setTitle(colorData.name)
              .onClick(async () => {
                // Update the color in the store
                calendarOnlyTodos.update(currentTodos => {
                  return currentTodos.map(t =>
                    t.id === todo.id ? { ...t, color: colorKey as TodoColor } : t
                  );
                });

                // Save to plugin data
                await plugin.updateCalendarOnlyTodo(todo.id, {
                  color: colorKey as TodoColor
                });
              });
          });
        });
      } else {
        // Pour les todos du vault : changer la couleur du tag
        const tagToColor = todo.tags && todo.tags.length > 0 ? todo.tags[0] : '';
        const submenu = item
          .setTitle(tagToColor ? `Couleur pour #${tagToColor}` : 'Couleur (Sans tag)')
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
      }
    });

    menu.addSeparator();

    menu.addItem((item) => {
      item
        .setTitle('Duplicate')
        .setIcon('copy')
        .onClick(async () => {
          // Create a duplicate as a calendar-only todo
          const duplicatedTodo = CalendarTodoService.createTodo(
            todo.text,
            todo.date || '',
            todo.time || '00:00',
            todo.duration || 30
          );

          // If the original had a color, copy it
          if (isCalendarOnly && todo.color) {
            duplicatedTodo.color = todo.color;
          }

          // Add to store
          calendarOnlyTodos.update(todos => [...todos, duplicatedTodo]);

          // Save to plugin data
          await plugin.addCalendarOnlyTodo(duplicatedTodo);
        });
    });

    menu.addItem((item) => {
      item
        .setTitle('Remove from calendar')
        .setIcon('calendar-x')
        .onClick(async () => {
          if (isCalendarOnly) {
            // Delete the calendar-only todo permanently
            await plugin.deleteCalendarOnlyTodo(todo.id);
            calendarOnlyTodos.update(todos => todos.filter(t => t.id !== todo.id));
          } else {
            // Remove date, time and duration from vault todo
            await vaultSync.updateTodoInVault(todo, {
              date: undefined,
              time: undefined,
              duration: undefined
            });
          }
        });
    });

    // Only show "Open file" for vault todos
    if (!isCalendarOnly && todo.filePath) {
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

  function handleCellContextMenu(event: MouseEvent, day: Date, hour: number) {
    event.preventDefault();

    const menu = new Menu();

    menu.addItem((item) => {
      item
        .setTitle('Create task here')
        .setIcon('plus')
        .onClick(() => {
          openCreateTodoModal(day, hour);
        });
    });

    menu.showAtMouseEvent(event);
  }

  function openCreateTodoModal(day: Date, hour: number) {
    modalDate = formatDate(day);
    modalTime = `${String(hour).padStart(2, '0')}:00`;
    showCreateModal = true;
  }

  function closeCreateTodoModal() {
    showCreateModal = false;
  }

  // Fast lookup functions - take maps as parameter to ensure Svelte reactivity
  function getAllDayTodosForDay(day: Date, maps: typeof todosByDayHour): Todo[] {
    const dateStr = formatDate(day);
    return maps.byDay.get(dateStr) || [];
  }

  function getTodosForHour(day: Date, hour: number, maps: typeof todosByDayHour): Todo[] {
    const dateStr = formatDate(day);
    const key = `${dateStr}-${hour}`;
    return maps.byHour.get(key) || [];
  }

  function formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // TEMPORARY: Overlap detection disabled due to Svelte 5 reactivity bug causing freezes
  // TODO: Re-implement overlap detection with proper performance optimizations

  function getEventPosition(todo: Todo, dateStr: string): { top: number; height: number; column: number; totalColumns: number } {
    // Temporarily disable overlap detection - all todos take full width
    const overlap = { column: 0, totalColumns: 1 };

    // Use visual state if this event is being resized
    if (isResizing && resizeEventId === todo.id && resizeVisualState) {
      const duration = resizeVisualState.duration ?? todo.duration ?? 30;
      const height = (duration / 60) * 60;

      // Use time from visual state if available (for top handle resize)
      const time = resizeVisualState.time || todo.time;
      if (!time) return { top: 0, height, ...overlap };

      const [hours, minutes] = time.split(':').map(Number);
      const top = (minutes / 60) * 60;

      return { top, height, ...overlap };
    }

    // Normal rendering
    if (!todo.time) return { top: 0, height: 60, ...overlap };

    const [hours, minutes] = todo.time.split(':').map(Number);
    const top = (minutes / 60) * 60;
    const duration = todo.duration || 30;
    const height = (duration / 60) * 60;

    return { top, height, ...overlap };
  }
</script>

<div class="calendar-container">
  <div class="calendar-header">
    <div class="calendar-navigation">
      <button on:click={goToPreviousWeek} class="nav-button">&lt;</button>
      <button on:click={goToToday} class="nav-button">Today</button>
      <button on:click={goToNextWeek} class="nav-button">&gt;</button>
    </div>
    <h2 class="current-week-display">
      {$currentWeekStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
    </h2>
  </div>

  <div class="calendar-grid-container">
    <!-- Partie fixe: En-têtes et zone All-Day -->
    <div class="calendar-grid-header">
      <!-- En-tête avec les jours de la semaine -->
      <div class="time-column-header"></div>
      {#each daysMetadata as dayMeta (dayMeta.timestamp)}
        <div class="day-header" class:today={dayMeta.isToday}>
          <span class="day-name">{dayMeta.weekday}</span>
          <span class="day-number">{dayMeta.dayNumber}</span>
        </div>
      {/each}

      <!-- Zone All-Day -->
      <div class="time-column-all-day">Toute la journée</div>
      {#each daysMetadata as dayMeta (dayMeta.timestamp)}
        <AllDayZone day={dayMeta.date} todos={getAllDayTodosForDay(dayMeta.date, todosByDayHour)} hideLabel={true} />
      {/each}
    </div>

    <!-- Partie scrollable: Grille horaire -->
    <div class="calendar-grid-body">
      <!-- Current time indicator (only show if today is in the current week) -->
      {#if todayDayIndex >= 0}
        <div class="current-time-wrapper" style="top: {currentTimePosition}px;">
          <!-- Ligne fine qui traverse toute la semaine -->
          <div class="time-line-full">
            <span class="current-time-label">{currentTimeString}</span>
          </div>
          <!-- Ligne épaisse uniquement sur today -->
          <div class="time-line-today" style="grid-column: {todayDayIndex + 2};"></div>
        </div>
      {/if}

      <!-- Grille horaire -->
      {#each hours as hour}
        <div class="time-cell">{hour}:00</div>
        {#each daysMetadata as dayMeta, dayIndex (dayMeta.timestamp)}
          <div
            class="event-cell"
            class:today={dayMeta.isToday}
            class:drag-over={draggedOverCell?.dayIndex === dayIndex && draggedOverCell?.hour === hour}
            on:dragover={(e) => handleDragOver(e, dayIndex, hour)}
            on:dragleave={handleDragLeave}
            on:drop={(e) => handleDrop(e, dayMeta.date, hour)}
            on:contextmenu={(e) => handleCellContextMenu(e, dayMeta.date, hour)}
            role="gridcell"
            tabindex="0"
          >
            {#each getTodosForHour(dayMeta.date, hour, todosByDayHour) as todo (todo.id)}
              {@const dateStr = formatDate(dayMeta.date)}
              {@const position = getEventPosition(todo, dateStr)}
              {@const colors = getTodoColorFromTags(todo, $tagColors)}
              <TodoItem
                {todo}
                variant="calendar"
                {colors}
                {position}
                showOpenArrow={true}
                showResizeHandles={true}
                onToggleStatus={handleToggleStatus}
                onDoubleClick={handleEventDoubleClick}
                onDragStart={handleEventDragStart}
                onContextMenu={handleEventContextMenu}
                onResizeMouseDown={handleMouseDown}
              />
            {/each}

            <!-- Preview du drop pendant le drag -->
            {#if dropPreview && dropPreview.dayIndex === dayIndex && dropPreview.hour === hour}
              {@const previewPos = getPreviewPosition(dropPreview)}
              {#if previewPos}
                {@const colors = getTodoColorFromTags(dropPreview.todo, $tagColors)}
                <div
                  class="drop-preview"
                  style="top: {previewPos.top}px; height: {previewPos.height}px; background-color: {colors.bg}; color: {colors.text};"
                >
                  <div class="preview-content">
                    <span class="preview-text">{dropPreview.todo.text}</span>
                    <span class="preview-time">{previewPos.time}</span>
                  </div>
                </div>
              {/if}
            {/if}
          </div>
        {/each}
      {/each}
    </div>
  </div>
</div>

<!-- Create Todo Modal -->
{#if showCreateModal}
  <CreateTodoModal
    date={modalDate}
    time={modalTime}
    onClose={closeCreateTodoModal}
  />
{/if}

<style>
  /* Calendar grid container with fixed header and scrollable body */
  .calendar-grid-container {
    display: flex;
    flex-direction: column;
    flex: 1;
    border: 1px solid rgba(var(--text-muted-rgb), 0.12);
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  }

  .calendar-grid-header {
    flex-shrink: 0;
    display: grid;
    grid-template-columns: 60px repeat(7, 1fr);
    grid-template-rows: auto auto;
    gap: 0;
    background-color: var(--background-secondary);
  }

  .calendar-grid-body {
    flex-grow: 1;
    overflow-y: auto;
    overflow-x: hidden;
    display: grid;
    grid-template-columns: 60px repeat(7, 1fr);
    grid-auto-rows: minmax(60px, auto);
    gap: 0;
    position: relative;
    contain: layout style paint;
  }

  /* Current time indicator */
  .current-time-wrapper {
    grid-column: 1 / -1;
    position: absolute;
    width: 100%;
    height: 0;
    pointer-events: none;
    z-index: 50;
    display: grid;
    grid-template-columns: 60px repeat(7, 1fr);
    gap: 0;
  }

  .time-line-full {
    grid-column: 2 / 9; /* Du début de Monday (col 2) à la fin de Sunday (col 9) */
    grid-row: 1;
    height: 2px;
    background-color: rgba(255, 0, 0, 0.6);
    position: relative;
  }

  .current-time-label {
    position: absolute;
    left: -50px;
    top: 50%;
    transform: translateY(-50%);
    background-color: rgba(255, 0, 0, 0.9);
    color: white;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
    white-space: nowrap;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }

  .time-line-today {
    grid-row: 1;
    height: 2px;
    background-color: rgba(255, 0, 0, 0.9);
    box-shadow: 0 0 4px rgba(255, 0, 0, 0.5);
    position: relative;
  }

  .time-line-today::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 8px;
    height: 8px;
    background-color: rgba(255, 0, 0, 0.9);
    border-radius: 50%;
    box-shadow: 0 0 4px rgba(255, 0, 0, 0.5);
  }
</style>
