<script lang="ts">
  import { onMount, getContext } from 'svelte';
  import { App, Menu } from 'obsidian';
  import AllDayZone from './AllDayZone.svelte';
  import {
    currentWeekStart,
    daysInWeek,
    goToPreviousWeek,
    goToNextWeek,
    goToToday
  } from '../stores/calendarStore';
  import { todos } from '../stores/todoStore';
  import { tagColors, setTagColor } from '../stores/uiStore';
  import type { Todo, TodoColor } from '../types';
  import type { VaultSync } from '../services/VaultSync';
  import { openTodoInEditor } from '../utils/editorUtils';
  import { TODO_COLORS, getTodoColorFromTags } from '../utils/colors';

  const app = getContext<App>('app');
  const vaultSync = getContext<VaultSync>('vaultSync');
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

    // Mesurer l'offset de la première cellule horaire (début de 0:00)
    const firstTimeCell = document.querySelector('.time-cell');
    const offset = firstTimeCell ? firstTimeCell.offsetTop : 0;

    // Calculate position: (hours * 40px) + (minutes/60 * 40px) + offset des headers
    currentTimePosition = (hours * 40) + (minutes / 60 * 40) + offset;

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

      // Calculer les minutes depuis offsetY dans la cellule
      const cellHeight = 40; // 40px par heure
      const offsetY = event.offsetY || 0;
      const minutesInCell = Math.round((offsetY / cellHeight) * 60);

      // Snap to 30-minute increments
      const snappedMinutes = Math.round(minutesInCell / 30) * 30;
      const finalMinutes = snappedMinutes >= 60 ? 0 : snappedMinutes;
      const finalHour = snappedMinutes >= 60 ? hour + 1 : hour;

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

      // Mettre à jour le todo dans le vault
      await vaultSync.updateTodoInVault(todo, {
        date: dateStr,
        time: timeStr
      });

    } catch (error) {
      console.error('Error handling drop:', error);
    }
  }

  // Calculer la position du preview pendant le drag
  function getPreviewPosition(preview: typeof dropPreview): { top: number; height: number; time: string } | null {
    if (!preview) return null;

    const cellHeight = 40;
    const offsetY = preview.offsetY;
    const minutesInCell = Math.round((offsetY / cellHeight) * 60);

    // Snap to 30-minute increments
    const snappedMinutes = Math.round(minutesInCell / 30) * 30;
    const finalMinutes = snappedMinutes >= 60 ? 0 : snappedMinutes;
    const finalHour = snappedMinutes >= 60 ? preview.hour + 1 : preview.hour;

    const top = (finalMinutes / 60) * cellHeight;
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
    const cellHeight = 40; // 40px par heure
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
        // Optimistic update: Update store immediately to prevent flash
        todos.update(currentTodos => {
          return currentTodos.map(t =>
            t.id === resizeTodo.id ? { ...t, ...updates } : t
          );
        });

        // Then save to vault (handleFileModify will update store again, but UI is already correct)
        await vaultSync.updateTodoInVault(resizeTodo, updates);
      }

      // Reset state AFTER store update
      isResizing = false;
      resizeEventId = null;
      resizeTodo = null;
      initialTime = null;
      resizeHandleType = null;
      resizeVisualState = null;
    }

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

      // Positionner hors écran mais visible pour le rendu
      ghost.style.position = 'fixed';
      ghost.style.top = '-9999px';
      ghost.style.left = '-9999px';
      ghost.style.width = '280px';
      ghost.style.maxWidth = '280px';
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

    // Sous-menu pour changer la couleur (du tag ou "Sans tag")
    menu.addItem((item) => {
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
    });

    menu.addSeparator();

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

  function getEventPosition(todo: Todo): { top: number; height: number } {
    // Use visual state if this event is being resized
    if (isResizing && resizeEventId === todo.id && resizeVisualState) {
      const duration = resizeVisualState.duration ?? todo.duration ?? 30;
      const height = (duration / 60) * 40;

      // Use time from visual state if available (for top handle resize)
      const time = resizeVisualState.time || todo.time;
      if (!time) return { top: 0, height };

      const [hours, minutes] = time.split(':').map(Number);
      const top = (minutes / 60) * 40;

      return { top, height };
    }

    // Normal rendering
    if (!todo.time) return { top: 0, height: 40 };

    const [hours, minutes] = todo.time.split(':').map(Number);
    const top = (minutes / 60) * 40;
    const duration = todo.duration || 30;
    const height = (duration / 60) * 40;

    return { top, height };
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

  <div class="week-view-grid">
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
          role="gridcell"
          tabindex="0"
        >
          {#each getTodosForHour(dayMeta.date, hour, todosByDayHour) as todo (todo.id)}
            {@const position = getEventPosition(todo)}
            {@const colors = getTodoColorFromTags(todo, $tagColors)}
            <div
              class="calendar-event"
              class:completed={todo.status === 'done'}
              style="top: {position.top}px; height: {position.height}px; background-color: {colors.bg}; color: {colors.text};"
              draggable="true"
              on:dragstart={(e) => handleEventDragStart(e, todo)}
              on:dblclick={() => handleEventDoubleClick(todo)}
              on:contextmenu={(e) => handleEventContextMenu(e, todo)}
            >
              <div class="event-content">
                <input
                  type="checkbox"
                  class="event-checkbox"
                  checked={todo.status === 'done'}
                  on:click={(e) => handleToggleStatus(e, todo)}
                />
                <span class="event-text">{todo.text}</span>
              </div>
              <div
                class="resize-handle top"
                draggable="false"
                on:mousedown={(e) => handleMouseDown(e, todo, 'top')}
                role="slider"
                aria-label="Resize top"
                tabindex="0"
              ></div>
              <div
                class="resize-handle bottom"
                draggable="false"
                on:mousedown={(e) => handleMouseDown(e, todo, 'bottom')}
                role="slider"
                aria-label="Resize bottom"
                tabindex="0"
              ></div>
            </div>
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

<style>
  .calendar-event {
    border-radius: 6px;
    padding: 6px 8px;
    font-size: 0.8em;
    font-weight: 500;
    margin: 2px;
    position: absolute;
    width: calc(100% - 4px);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    z-index: 1;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
    cursor: grab;
    transition: all 0.15s ease;
    border-left: 3px solid rgba(0, 0, 0, 0.15);
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

  .calendar-event.completed {
    opacity: 0.6;
  }

  .event-content {
    display: flex;
    align-items: center;
    gap: 6px;
    overflow: hidden;
  }

  .event-checkbox {
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

  .event-checkbox:checked {
    background-color: var(--interactive-accent);
    border-color: var(--interactive-accent);
  }

  .event-checkbox:checked::after {
    content: '✓';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: white;
    font-size: 12px;
    font-weight: bold;
  }

  .event-checkbox:hover {
    border-color: var(--interactive-accent);
    transform: scale(1.1);
  }

  .event-text {
    flex-grow: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .calendar-event.completed .event-text {
    text-decoration: line-through;
  }

  /* Current time indicator */
  .current-time-wrapper {
    grid-column: 1 / -1;
    grid-row: 3 / -1;
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
