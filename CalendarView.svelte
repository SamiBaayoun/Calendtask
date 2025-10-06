<script lang="ts">
  import { onMount } from 'svelte';

  interface CalendarEvent {
    id: string;
    text: string;
    start: Date;
    end: Date;
    dayIndex: number; // 0 for Monday, 6 for Sunday
  }

  let currentWeekStart: Date;
  let daysInWeek: Date[] = [];
  let calendarEvents: CalendarEvent[] = [];

  onMount(() => {
    currentWeekStart = getStartOfWeek(new Date());
    generateWeekDays(currentWeekStart);

    // Add event listeners for resizing
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  });

  function getStartOfWeek(date: Date): Date {
    const day = date.getDay(); // 0 for Sunday, 1 for Monday
    const diff = date.getDate() - (day === 0 ? 6 : day - 1); // Adjust for Monday start
    return new Date(date.getFullYear(), date.getMonth(), diff);
  }

  function generateWeekDays(startOfWeek: Date) {
    daysInWeek = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(startOfWeek);
      day.setDate(startOfWeek.getDate() + i);
      daysInWeek.push(day);
    }
  }

  function goToPreviousWeek() {
    currentWeekStart = new Date(currentWeekStart.getFullYear(), currentWeekStart.getMonth(), currentWeekStart.getDate() - 7);
    generateWeekDays(currentWeekStart);
  }

  function goToNextWeek() {
    currentWeekStart = new Date(currentWeekStart.getFullYear(), currentWeekStart.getMonth(), currentWeekStart.getDate() + 7);
    generateWeekDays(currentWeekStart);
  }

  function isToday(date: Date): boolean {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  }

  const hours = Array.from({ length: 24 }, (_, i) => i);

  function getNearestHalfHour(date: Date): Date {
    const minutes = date.getMinutes();
    const roundedMinutes = Math.round(minutes / 30) * 30;
    date.setMinutes(roundedMinutes, 0, 0);
    return date;
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault(); // Permet le dépôt
  }

  function handleDrop(event: DragEvent, day: Date, hour: number) {
    event.preventDefault();
    const todoId = event.dataTransfer?.getData('text/plain');
    if (todoId) {
      const dropTime = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, event.offsetY / 40 * 60); // 40px par heure, donc 1px = 1.5 minutes
      const snappedTime = getNearestHalfHour(dropTime);

      const newEvent: CalendarEvent = {
        id: todoId,
        text: `Tâche ${todoId}`,
        start: snappedTime,
        end: new Date(snappedTime.getTime() + 30 * 60 * 1000), // Durée par défaut de 30 minutes
        dayIndex: daysInWeek.findIndex(d => d.toDateString() === day.toDateString()),
      };
      calendarEvents = [...calendarEvents, newEvent];
    }
  }
  
  let isResizing = false;
  let resizeEvent: CalendarEvent | null = null;
  let initialY = 0;
  let initialHeight = 0;
  let resizeHandleType: 'top' | 'bottom' | null = null;

  function handleMouseDown(event: MouseEvent, eventToResize: CalendarEvent, type: 'top' | 'bottom') {
    isResizing = true;
    resizeEvent = eventToResize;
    initialY = event.clientY;
    initialHeight = (eventToResize.end.getTime() - eventToResize.start.getTime()) / (60 * 1000) / 60 * 40; // Hauteur en pixels
    resizeHandleType = type;

    event.stopPropagation(); // Empêche le drag de l'événement
  }

  function handleMouseMove(event: MouseEvent) {
    if (!isResizing || !resizeEvent || !resizeHandleType) return;

    const deltaY = event.clientY - initialY;
    const newHeightPx = initialHeight + (resizeHandleType === 'bottom' ? deltaY : -deltaY);
    const newDurationMinutes = Math.round(newHeightPx / 40 * 60 / 30) * 30; // Snap to 30-minute increments

    calendarEvents = calendarEvents.map(e => {
      if (e.id === resizeEvent?.id) {
        const newEnd = new Date(e.start.getTime() + newDurationMinutes * 60 * 1000);
        return { ...e, end: newEnd };
      }
      return e;
    });
  }

  function handleMouseUp() {
    isResizing = false;
    resizeEvent = null;
    resizeHandleType = null;
  }

</script>

<div class="calendar-container">
  <div class="calendar-header">
    <div class="calendar-navigation">
      <button on:click={goToPreviousWeek} class="nav-button">&lt;</button>
      <button on:click={goToNextWeek} class="nav-button">&gt;</button>
    </div>
    <h2 class="current-week-display">
      {currentWeekStart?.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
    </h2>
  </div>

  <div class="week-view-grid-wrapper">
    <div class="week-view-grid">
      <div class="time-column-header"></div>
      {#each daysInWeek as day}
        <div class="day-header" class:today={isToday(day)}>
          <span class="day-name">{day.toLocaleDateString('fr-FR', { weekday: 'short' })}</span>
          <span class="day-number">{day.getDate()}</span>
        </div>
      {/each}

      {#each hours as hour}
        <div class="time-cell">{hour}:00</div>
        {#each daysInWeek as day, dayIndex}
          <div
            class="event-cell"
            class:today={isToday(day)}
            on:dragover={handleDragOver}
            on:drop={(e) => handleDrop(e, day, hour)}
            role="gridcell"
            tabindex="0"
          >
            {#each calendarEvents.filter(event => event.dayIndex === dayIndex && event.start.getHours() === hour) as event (event.id)}
              <div class="calendar-event" style="top: {event.start.getMinutes() / 60 * 40}px; height: {(event.end.getTime() - event.start.getTime()) / (60 * 1000) / 60 * 40}px;">
                {event.text}
                <div class="resize-handle top" on:mousedown={(e) => handleMouseDown(e, event, 'top')} role="slider" aria-label="Redimensionner le haut de l'événement" tabindex="0" aria-valuenow="{event.start.getHours() * 60 + event.start.getMinutes()}" aria-valuemin="0" aria-valuemax="1440"></div>
                <div class="resize-handle bottom" on:mousedown={(e) => handleMouseDown(e, event, 'bottom')} role="slider" aria-label="Redimensionner le bas de l'événement" tabindex="0" aria-valuenow="{event.end.getHours() * 60 + event.end.getMinutes()}" aria-valuemin="0" aria-valuemax="1440"></div>
              </div>
            {/each}
          </div>
        {/each}
      {/each}
    </div>

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
