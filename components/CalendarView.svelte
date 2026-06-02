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
    goToToday,
    calendarView,
    setCalendarView,
    type CalendarViewType
  } from '../stores/calendarStore';
  import { todos, calendarOnlyTodos } from '../stores/todoStore';
  import { tagColors, setTagColor } from '../stores/uiStore';
  import type { Todo, TodoColor } from '../types';
  import type { VaultSync } from '../services/VaultSync';
  import type CalendTaskPlugin from '../main';
  import { openTodoInEditor } from '../utils/editorUtils';
  import { TODO_COLORS, getTodoHueFromTags } from '../utils/colors';
  import { CalendarTodoService } from '../services/CalendarTodoService';
  import { ICSParser } from '../services/ICSParser';
  import { Notice } from 'obsidian';
  import { dragState, dropTarget, pendingDrop, type DragTask, type DropTarget } from '../stores/dragStore';

  const HOUR_PX = 60;

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

  // Modal state
  let showCreateModal = $state(false);
  let modalDate = $state('');
  let modalTime = $state('');
  let modalContainer: HTMLElement | null = null;

  // Current time indicator state
  let currentTimePosition = $state(0);
  let todayDayIndex = $state(-1);
  let currentTimeString = $state('');

  let weekLabel = $derived.by(() => {
    const days = $daysInWeek;
    if (!days || days.length === 0) return '';
    const start = days[0];
    const end = days[days.length - 1];
    const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
      return `${start.toLocaleDateString('en-US', { month: 'short' })} ${start.getDate()} – ${end.getDate()}`;
    }
    return `${fmt(start)} – ${fmt(end)}`;
  });

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
    const byDateTimed = new Map<string, Todo[]>();

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

      // Timed todos - index by hour bucket and by date
      const [h] = effectiveTime.split(':').map(Number);
      const hourKey = `${todo.date}-${h}`;
      if (!byHour.has(hourKey)) byHour.set(hourKey, []);
      byHour.get(hourKey)!.push(todo);

      if (!byDateTimed.has(todo.date)) byDateTimed.set(todo.date, []);
      byDateTimed.get(todo.date)!.push(todo);
    });

    return { byHour, byDay, byDateTimed };
  });

  // Pre-compute overlap layout once per day (avoids O(n²) × todos recalculs)
  let dayOverlapLayouts = $derived.by(() => {
    const layouts = new Map<string, Map<string, { column: number; totalColumns: number }>>();
    for (const [dateStr, dayTodos] of todosByDayHour.byDateTimed) {
      layouts.set(dateStr, calculateOverlapColumns(dayTodos));
    }
    return layouts;
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
    updateCurrentTime();
    const timeInterval = setInterval(updateCurrentTime, 60000);

    const unsubDrop = pendingDrop.subscribe(drop => {
      if (drop) {
        pendingDrop.set(null);
        handleSchedule(drop.task, drop.target);
      }
    });

    return () => {
      clearInterval(timeInterval);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      unsubDrop();
    };
  });

  async function handleSchedule(task: DragTask, target: DropTarget) {
    const dayMeta = daysMetadata[target.day];
    if (!dayMeta) return;

    const dateStr = formatDate(dayMeta.date);
    const todo = $todos.find(t => t.id === task.id);
    if (!todo) return;

    // Dépôt dans la zone all-day : supprimer heure et durée
    if (target.isAllDay) {
      const isCalendarOnly = CalendarTodoService.isCalendarOnly(todo);
      if (isCalendarOnly) {
        calendarOnlyTodos.update(ts => ts.map(t =>
          t.id === todo.id ? { ...t, date: dateStr, time: undefined, duration: undefined } : t
        ));
        await plugin.updateCalendarOnlyTodo(todo.id, { date: dateStr, time: undefined, duration: undefined });
      } else {
        await vaultSync.updateTodoInVault(todo, { date: dateStr, time: undefined, duration: undefined });
      }
      return;
    }

    const h = Math.floor(target.start);
    const m = Math.round((target.start - h) * 60);
    const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

    const duration = todo.duration || 60;
    if (h * 60 + m + duration > 1439) return;

    const isCalendarOnly = CalendarTodoService.isCalendarOnly(todo);
    if (isCalendarOnly) {
      calendarOnlyTodos.update(todos => todos.map(t =>
        t.id === todo.id ? { ...t, date: dateStr, time: timeStr } : t
      ));
      await plugin.updateCalendarOnlyTodo(todo.id, { date: dateStr, time: timeStr });
    } else {
      await vaultSync.updateTodoInVault(todo, { date: dateStr, time: timeStr });
    }
  }

  function fmtDropTime(h: number): string {
    const hr = Math.floor(h);
    const m = Math.round((h - hr) * 60);
    return `${String(hr).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
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
          const capturedId = resizeTodo.id;
          const capturedTime = initialTime;
          // Always include the original time to override any stale state set by an accidental drag
          const persistUpdates = capturedTime != null
            ? { time: capturedTime, ...updates }
            : updates;
          calendarOnlyTodos.update(currentTodos =>
            currentTodos.map(t =>
              t.id === capturedId ? { ...t, ...persistUpdates } : t
            )
          );
          await plugin.updateCalendarOnlyTodo(capturedId, persistUpdates);
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

  async function handleEventContextMenu(event: MouseEvent, todo: Todo) {
    event.preventDefault();
    event.stopPropagation();

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

          // Copy additional properties from the original
          if (isCalendarOnly && todo.color) {
            duplicatedTodo.color = todo.color;
          }

          // Copy tags and priority
          duplicatedTodo.tags = todo.tags ? [...todo.tags] : [];
          duplicatedTodo.priority = todo.priority;

          // Copy file reference to keep link to source note
          duplicatedTodo.filePath = todo.filePath;
          duplicatedTodo.lineNumber = todo.lineNumber;

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

    // Show "Open file" if the task has an associated file
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

  // Handle ICS file import
  async function handleICSImport() {
    // Create a file input element
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ics';

    input.onchange = async (e: Event) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];

      if (!file) return;

      try {
        // Read file content
        const content = await file.text();

        // Parse ICS file
        const icsEvents = ICSParser.parseICS(content);

        if (icsEvents.length === 0) {
          new Notice('No events found in ICS file');
          return;
        }

        // Convert to todos
        const newTodos = ICSParser.convertToTodos(icsEvents);
        const existingTodos = $calendarOnlyTodos;

        // Separate duplicates and unique todos
        const { duplicates, unique } = ICSParser.separateDuplicates(newTodos, existingTodos);

        // Remove existing duplicates (including all occurrences of recurring events)
        if (duplicates.length > 0) {
          const eventsToRemove = ICSParser.getExistingEventsByBaseUid(duplicates, existingTodos);

          // Remove existing events from plugin data
          for (const existingTodo of eventsToRemove) {
            await plugin.deleteCalendarOnlyTodo(existingTodo.id);
          }

          // Remove from store
          calendarOnlyTodos.update(todos =>
            todos.filter(t => !eventsToRemove.some(r => r.id === t.id))
          );
        }

        // Import all new todos (unique + duplicates)
        const todosToImport = [...unique, ...duplicates];

        for (const todo of todosToImport) {
          await plugin.addCalendarOnlyTodo(todo);
        }

        // Update store
        calendarOnlyTodos.update(todos => [...todos, ...todosToImport]);

        // Show success message
        const updatedCount = duplicates.length;
        const newCount = unique.length;
        let message = `Imported ${todosToImport.length} event(s) from ICS file`;
        if (updatedCount > 0 && newCount > 0) {
          message += ` (${newCount} new, ${updatedCount} updated)`;
        } else if (updatedCount > 0) {
          message += ` (${updatedCount} updated)`;
        }
        new Notice(message);

      } catch (error) {
        new Notice('Error importing ICS file. Please check the file format.');
      }
    };

    input.click();
  }

  // Fast lookup functions - take maps as parameter to ensure Svelte reactivity
  function getAllDayTodosForDay(day: Date, maps: typeof todosByDayHour): Todo[] {
    return maps.byDay.get(formatDate(day)) || [];
  }

  function getTodosForDayTimed(day: Date, maps: typeof todosByDayHour): Todo[] {
    return maps.byDateTimed.get(formatDate(day)) || [];
  }

  function formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Gets the effective duration for a todo (considers resize state)
   */
  function getEffectiveDuration(todo: Todo): number {
    if (isResizing && resizeEventId === todo.id && resizeVisualState?.duration) {
      return resizeVisualState.duration;
    }
    return todo.duration || 30;
  }

  /**
   * Converts time string to minutes since midnight
   */
  function timeToMinutes(time: string | undefined): number {
    if (!time) return 0;
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Checks if two todos overlap in time
   */
  function todosOverlap(todo1: Todo, todo2: Todo): boolean {
    const time1 = getEffectiveTime(todo1);
    const time2 = getEffectiveTime(todo2);

    if (!time1 || !time2) return false;

    const start1 = timeToMinutes(time1);
    const end1 = start1 + getEffectiveDuration(todo1);
    const start2 = timeToMinutes(time2);
    const end2 = start2 + getEffectiveDuration(todo2);

    return start1 < end2 && start2 < end1;
  }

  /**
   * Calculate column layout for overlapping events using greedy algorithm
   * Returns { column: number, totalColumns: number } for each todo
   */
  function calculateOverlapColumns(todos: Todo[]): Map<string, { column: number; totalColumns: number }> {
    const layout = new Map<string, { column: number; totalColumns: number }>();

    if (todos.length === 0) return layout;
    if (todos.length === 1) {
      layout.set(todos[0].id, { column: 0, totalColumns: 1 });
      return layout;
    }

    // 1. Sort todos by start time
    const sortedTodos = [...todos].sort((a, b) => {
      const timeA = getEffectiveTime(a);
      const timeB = getEffectiveTime(b);
      return timeToMinutes(timeA) - timeToMinutes(timeB);
    });

    // 2. Find overlapping groups
    const groups: Todo[][] = [];
    let currentGroup: Todo[] = [sortedTodos[0]];

    for (let i = 1; i < sortedTodos.length; i++) {
      const current = sortedTodos[i];
      const overlapsWithGroup = currentGroup.some(todo => todosOverlap(todo, current));

      if (overlapsWithGroup) {
        currentGroup.push(current);
      } else {
        groups.push(currentGroup);
        currentGroup = [current];
      }
    }
    groups.push(currentGroup);

    // 3. Assign columns within each group using greedy algorithm
    groups.forEach(group => {
      if (group.length === 1) {
        layout.set(group[0].id, { column: 0, totalColumns: 1 });
      } else {
        const columns: Todo[][] = [];

        group.forEach(todo => {
          let placed = false;

          // Try to place in an existing column
          for (let colIndex = 0; colIndex < columns.length; colIndex++) {
            const column = columns[colIndex];
            const overlapsInColumn = column.some(t => todosOverlap(t, todo));

            if (!overlapsInColumn) {
              column.push(todo);
              layout.set(todo.id, { column: colIndex, totalColumns: 0 });
              placed = true;
              break;
            }
          }

          // Create a new column if couldn't place
          if (!placed) {
            columns.push([todo]);
            layout.set(todo.id, { column: columns.length - 1, totalColumns: 0 });
          }
        });

        // Update totalColumns for all todos in this group
        const totalColumns = columns.length;
        group.forEach(todo => {
          const current = layout.get(todo.id)!;
          layout.set(todo.id, { ...current, totalColumns });
        });
      }
    });

    return layout;
  }

  function getEventPosition(todo: Todo, dateStr: string): { top: number; height: number; column: number; totalColumns: number } {
    const overlap = dayOverlapLayouts.get(dateStr)?.get(todo.id) ?? { column: 0, totalColumns: 1 };

    // Use visual state if this event is being resized
    if (isResizing && resizeEventId === todo.id && resizeVisualState) {
      const duration = resizeVisualState.duration ?? todo.duration ?? 30;
      const height = (duration / 60) * 60;

      const time = resizeVisualState.time || todo.time;
      if (!time) return { top: 0, height, ...overlap };

      const [h, m] = time.split(':').map(Number);
      const top = h * 60 + m;

      return { top, height, ...overlap };
    }

    // Normal rendering
    if (!todo.time) return { top: 0, height: 60, ...overlap };

    const [h, m] = todo.time.split(':').map(Number);
    const top = h * 60 + m;
    const duration = todo.duration || 30;
    const height = (duration / 60) * 60;

    return { top, height, ...overlap };
  }
</script>

<div class="calendar-container">
  <div class="calendar-header">
    <div class="nav-group">
      <div class="nav-button icon-only" role="button" tabindex="0" aria-label="Semaine précédente"
        on:click={goToPreviousWeek}
        on:keydown={(e) => e.key === 'Enter' && goToPreviousWeek()}>
        <svg viewBox="0 0 16 16" fill="none" width="15" height="15">
          <path d="M10 4l-4 4 4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="nav-button" role="button" tabindex="0"
        on:click={goToToday}
        on:keydown={(e) => e.key === 'Enter' && goToToday()}>Today</div>
      <div class="nav-button icon-only" role="button" tabindex="0" aria-label="Semaine suivante"
        on:click={goToNextWeek}
        on:keydown={(e) => e.key === 'Enter' && goToNextWeek()}>
        <svg viewBox="0 0 16 16" fill="none" width="15" height="15">
          <path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
    </div>

    <div class="week-label">{weekLabel}</div>

    <div class="cal-head-spacer"></div>

    <div class="view-selector" role="tablist">
      <div
        class="view-button"
        class:active={$calendarView === 'day'}
        role="tab"
        tabindex="0"
        aria-selected={$calendarView === 'day'}
        on:click={() => setCalendarView('day')}
        on:keydown={(e) => e.key === 'Enter' && setCalendarView('day')}
      >Day</div>
      <div
        class="view-button"
        class:active={$calendarView === 'threeDays'}
        role="tab"
        tabindex="0"
        aria-selected={$calendarView === 'threeDays'}
        on:click={() => setCalendarView('threeDays')}
        on:keydown={(e) => e.key === 'Enter' && setCalendarView('threeDays')}
      >3 Days</div>
      <div
        class="view-button"
        class:active={$calendarView === 'week'}
        role="tab"
        tabindex="0"
        aria-selected={$calendarView === 'week'}
        on:click={() => setCalendarView('week')}
        on:keydown={(e) => e.key === 'Enter' && setCalendarView('week')}
      >Week</div>
    </div>

    <div class="import-ics-button" role="button" tabindex="0" title="Import ICS calendar"
      on:click={handleICSImport}
      on:keydown={(e) => e.key === 'Enter' && handleICSImport()}>
      <svg viewBox="0 0 16 16" fill="none" width="14" height="14">
        <path d="M8 11V4M5 6.5L8 3.5l3 3M3.5 12.5h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Import ICS
    </div>
  </div>

  <div class="calendar-grid-container" class:view-day={$calendarView === 'day'} class:view-threeDays={$calendarView === 'threeDays'} class:view-week={$calendarView === 'week'}>
    <!-- Partie fixe: En-têtes et zone All-Day -->
    <div class="calendar-grid-header" class:view-day={$calendarView === 'day'} class:view-threeDays={$calendarView === 'threeDays'} class:view-week={$calendarView === 'week'}>
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
      {#each daysMetadata as dayMeta, i (dayMeta.timestamp)}
        <AllDayZone day={dayMeta.date} dayIndex={i} todos={getAllDayTodosForDay(dayMeta.date, todosByDayHour)} hideLabel={true} />
      {/each}
    </div>

    <!-- Partie scrollable: Grille horaire -->
    <div class="calendar-grid-body" class:view-day={$calendarView === 'day'} class:view-threeDays={$calendarView === 'threeDays'} class:view-week={$calendarView === 'week'}>
      <!-- Current time indicator (only show if today is in the current week) -->
      {#if todayDayIndex >= 0}
        <div class="current-time-wrapper" class:view-day={$calendarView === 'day'} class:view-threeDays={$calendarView === 'threeDays'} class:view-week={$calendarView === 'week'} style="top: {currentTimePosition}px;">
          <div class="time-line-full">
            <span class="current-time-label">{currentTimeString}</span>
          </div>
          <div class="time-line-today" style="grid-column: {todayDayIndex + 2};"></div>
        </div>
      {/if}

      <!-- Axe horaire -->
      <div class="time-axis">
        {#each hours as hour}
          <div class="time-cell">{hour}:00</div>
        {/each}
      </div>

      <!-- Colonnes de jours -->
      {#each daysMetadata as dayMeta, dayIndex (dayMeta.timestamp)}
        <div class="day-col" class:today={dayMeta.isToday} data-day={dayIndex}
          on:contextmenu={(e) => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const hour = Math.min(23, Math.max(0, Math.floor((e.clientY - rect.top) / HOUR_PX)));
            handleCellContextMenu(e, dayMeta.date, hour);
          }}
        >

          <!-- Événements positionnés absolument dans la colonne -->
          {#each getTodosForDayTimed(dayMeta.date, todosByDayHour) as todo (todo.id)}
            {@const dateStr = formatDate(dayMeta.date)}
            {@const position = getEventPosition(todo, dateStr)}
            {@const hue = getTodoHueFromTags(todo, $tagColors)}
            <TodoItem
              {todo}
              variant="calendar"
              {hue}
              {position}
              showOpenArrow={true}
              showResizeHandles={true}
              onToggleStatus={handleToggleStatus}
              onDoubleClick={handleEventDoubleClick}
              onContextMenu={handleEventContextMenu}
              onResizeMouseDown={handleMouseDown}
            />
          {/each}

          <!-- Aperçu de dépôt -->
          {#if $dragState.active && !isResizing && $dropTarget && $dropTarget.day === dayIndex}
            {@const previewTop = $dropTarget.start * HOUR_PX}
            {@const previewHeight = ($dragState.task?.durationMinutes ?? 60) / 60 * HOUR_PX}
            <div
              class="drop-preview"
              style="top: {previewTop}px; height: {previewHeight}px;"
            >
              <div class="preview-content">
                <span class="preview-time">{fmtDropTime($dropTarget.start)}</span>
                <span class="preview-text">{$dropTarget.text}</span>
              </div>
            </div>
          {/if}
        </div>
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
    overflow: hidden;
    scrollbar-gutter: stable;
    contain: layout style;
  }

  .calendar-grid-header.view-day {
    grid-template-columns: 60px 1fr;
  }

  .calendar-grid-header.view-threeDays {
    grid-template-columns: 60px repeat(3, 1fr);
  }

  .calendar-grid-body {
    flex-grow: 1;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-gutter: stable;
    display: grid;
    grid-template-columns: 60px repeat(7, 1fr);
    gap: 0;
    position: relative;
    contain: layout style paint;
  }

  .calendar-grid-body.view-day {
    grid-template-columns: 60px 1fr;
  }

  .calendar-grid-body.view-threeDays {
    grid-template-columns: 60px repeat(3, 1fr);
  }

  .time-axis {
    display: flex;
    flex-direction: column;
    background-color: var(--background-secondary);
  }

  .day-col {
    position: relative;
    height: 1440px; /* 24 * HOUR_PX — remplace le flex des event-cells */
    border-left: 1px solid var(--background-modifier-border);
    background-image: repeating-linear-gradient(
      to bottom,
      transparent,
      transparent calc(60px - 1px),
      color-mix(in srgb, var(--background-modifier-border) 65%, transparent) calc(60px - 1px),
      color-mix(in srgb, var(--background-modifier-border) 65%, transparent) 60px
    );
  }

  .day-col.today {
    background-color: color-mix(in srgb, var(--interactive-accent) 4%, transparent);
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

  .current-time-wrapper.view-day {
    grid-template-columns: 60px 1fr;
  }

  .current-time-wrapper.view-threeDays {
    grid-template-columns: 60px repeat(3, 1fr);
  }

  .time-line-full {
    grid-column: 2 / 9; /* Du début de Monday (col 2) à la fin de Sunday (col 9) */
    grid-row: 1;
    height: 2px;
    background-color: color-mix(in srgb, var(--ct-now, var(--color-red, #e05561)) 60%, transparent);
    position: relative;
  }

  .view-day .time-line-full {
    grid-column: 2 / 3;
  }

  .view-threeDays .time-line-full {
    grid-column: 2 / 5;
  }

  .current-time-label {
    position: absolute;
    left: -50px;
    top: 50%;
    transform: translateY(-50%);
    background-color: var(--ct-now, var(--color-red, #e05561));
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
    background-color: var(--ct-now, var(--color-red, #e05561));
    box-shadow: 0 0 6px color-mix(in srgb, var(--ct-now, var(--color-red, #e05561)) 55%, transparent);
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
    background-color: var(--ct-now, var(--color-red, #e05561));
    border-radius: 50%;
    box-shadow: 0 0 4px color-mix(in srgb, var(--ct-now, var(--color-red, #e05561)) 55%, transparent);
  }
</style>
