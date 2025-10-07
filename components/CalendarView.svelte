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
  import type { Todo } from '../types';
  import type { VaultSync } from '../services/VaultSync';
  import { openTodoInEditor } from '../utils/editorUtils';

  const app = getContext<App>('app');
  const vaultSync = getContext<VaultSync>('vaultSync');
  const hours = Array.from({ length: 24 }, (_, i) => i);

  // Événements pour le resize et drag
  let isResizing = false;
  let resizeEventId: string | null = null;
  let resizeTodo: Todo | null = null;
  let initialY = 0;
  let initialDuration = 0;
  let initialTime: string | null = null;
  let resizeHandleType: 'top' | 'bottom' | null = null;

  onMount(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  });

  function isToday(date: Date): boolean {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
  }

  async function handleDrop(event: DragEvent, day: Date, hour: number) {
    event.preventDefault();
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

  function handleMouseDown(event: MouseEvent, todo: Todo, type: 'top' | 'bottom') {
    isResizing = true;
    resizeEventId = todo.id;
    resizeTodo = todo;
    initialY = event.clientY;
    initialDuration = todo.duration || 30;
    initialTime = todo.time || null;
    resizeHandleType = type;
    event.stopPropagation();
    event.preventDefault();
  }

  function handleMouseMove(event: MouseEvent) {
    if (!isResizing || !resizeEventId || !resizeTodo || !initialTime) return;

    const deltaY = event.clientY - initialY;
    const cellHeight = 40; // 40px par heure
    const deltaMinutes = Math.round((deltaY / cellHeight) * 60);

    if (resizeHandleType === 'bottom') {
      // Resize depuis le bas : augmenter/diminuer la durée
      let newDuration = Math.max(15, initialDuration + deltaMinutes); // Min 15 minutes
      // Snap to 15-minute increments
      newDuration = Math.round(newDuration / 15) * 15;

      // Vérifier que l'événement ne dépasse pas 23:59
      const [hours, minutes] = initialTime.split(':').map(Number);
      const startMinutes = hours * 60 + minutes;
      const endMinutes = startMinutes + newDuration;

      // Limite à 23:59 (1439 minutes depuis minuit)
      if (endMinutes > 1439) {
        newDuration = 1439 - startMinutes;
      }

      // Update the todo duration visually (will be saved on mouseup)
      resizeTodo.duration = newDuration;
      todos.update(t => [...t]);

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
        resizeTodo.time = `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
        resizeTodo.duration = newDuration;
        todos.update(t => [...t]);
      }
    }
  }

  async function handleMouseUp() {
    if (isResizing && resizeTodo) {
      const durationChanged = resizeTodo.duration !== initialDuration;
      const timeChanged = resizeTodo.time !== initialTime;

      if (durationChanged || timeChanged) {
        // Save changes to vault
        const updates: Partial<Todo> = {};

        if (timeChanged && resizeTodo.time) {
          updates.time = resizeTodo.time;
        }

        if (durationChanged && resizeTodo.duration) {
          updates.duration = resizeTodo.duration;
        }

        await vaultSync.updateTodoInVault(resizeTodo, updates);
      }
    }

    isResizing = false;
    resizeEventId = null;
    resizeTodo = null;
    initialTime = null;
    resizeHandleType = null;
  }

  async function handleEventDoubleClick(todo: Todo) {
    await openTodoInEditor(app, todo);
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
          // Retirer la date et l'heure du todo
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

  // Filtrer les todos pour la zone all-day de chaque jour
  function getAllDayTodosForDay(day: Date, allTodos: Todo[]): Todo[] {
    const dateStr = formatDate(day);
    return allTodos.filter(todo =>
      todo.date === dateStr && !todo.time
    );
  }

  // Filtrer les todos avec heure pour chaque cellule
  function getTodosForHour(day: Date, hour: number, allTodos: Todo[]): Todo[] {
    const dateStr = formatDate(day);
    return allTodos.filter(todo => {
      if (todo.date !== dateStr || !todo.time) return false;
      const todoHour = parseInt(todo.time.split(':')[0], 10);
      return todoHour === hour;
    });
  }

  function formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function getEventPosition(todo: Todo): { top: number; height: number } {
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
      <button on:click={goToToday} class="nav-button">Aujourd'hui</button>
      <button on:click={goToNextWeek} class="nav-button">&gt;</button>
    </div>
    <h2 class="current-week-display">
      {$currentWeekStart.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
    </h2>
  </div>

  <div class="week-view-grid">
    <!-- En-tête avec les jours de la semaine -->
    <div class="time-column-header"></div>
    {#each $daysInWeek as day (day.getTime())}
      <div class="day-header" class:today={isToday(day)}>
        <span class="day-name">{day.toLocaleDateString('fr-FR', { weekday: 'short' })}</span>
        <span class="day-number">{day.getDate()}</span>
      </div>
    {/each}

    <!-- Zone All-Day -->
    <div class="time-column-all-day">Toute la journée</div>
    {#each $daysInWeek as day (day.getTime())}
      <AllDayZone {day} todos={getAllDayTodosForDay(day, $todos)} hideLabel={true} />
    {/each}

    <!-- Grille horaire -->
    {#each hours as hour}
      <div class="time-cell">{hour}:00</div>
      {#each $daysInWeek as day, dayIndex (day.getTime())}
        <div
          class="event-cell"
          class:today={isToday(day)}
          on:dragover={handleDragOver}
          on:drop={(e) => handleDrop(e, day, hour)}
          role="gridcell"
          tabindex="0"
        >
          {#each getTodosForHour(day, hour, $todos) as todo (todo.id)}
            {@const position = getEventPosition(todo)}
            <div
              class="calendar-event"
              style="top: {position.top}px; height: {position.height}px;"
              draggable="true"
              on:dragstart={(e) => handleEventDragStart(e, todo)}
              on:dblclick={() => handleEventDoubleClick(todo)}
              on:contextmenu={(e) => handleEventContextMenu(e, todo)}
            >
              {todo.text}
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
        </div>
      {/each}
    {/each}
  </div>
</div>

<style>
  .calendar-event {
    background-color: var(--interactive-accent);
    color: white;
    border-radius: 4px;
    padding: 2px 5px;
    font-size: 0.8em;
    margin: 1px;
    position: absolute;
    width: calc(100% - 2px);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    z-index: 1;
  }
</style>
