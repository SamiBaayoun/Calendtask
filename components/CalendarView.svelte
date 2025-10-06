<script lang="ts">
  import { onMount } from 'svelte';
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

  const hours = Array.from({ length: 24 }, (_, i) => i);

  // Événements pour le resize
  let isResizing = false;
  let resizeEventId: string | null = null;
  let initialY = 0;
  let initialHeight = 0;
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

  function handleDrop(event: DragEvent, day: Date, hour: number) {
    event.preventDefault();
    // TODO: Implémenter la création d'événement
    const data = event.dataTransfer?.getData('text/plain');
    if (data) {
      console.log('Dropped:', data, 'on', day, 'at hour', hour);
    }
  }

  function handleMouseDown(event: MouseEvent, todoId: string, type: 'top' | 'bottom') {
    isResizing = true;
    resizeEventId = todoId;
    initialY = event.clientY;
    resizeHandleType = type;
    event.stopPropagation();
  }

  function handleMouseMove(event: MouseEvent) {
    if (!isResizing || !resizeEventId) return;
    // TODO: Implémenter le resize
  }

  function handleMouseUp() {
    isResizing = false;
    resizeEventId = null;
    resizeHandleType = null;
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
            >
              {todo.text}
              <div
                class="resize-handle top"
                on:mousedown={(e) => handleMouseDown(e, todo.id, 'top')}
                role="slider"
                aria-label="Resize top"
                tabindex="0"
              ></div>
              <div
                class="resize-handle bottom"
                on:mousedown={(e) => handleMouseDown(e, todo.id, 'bottom')}
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
