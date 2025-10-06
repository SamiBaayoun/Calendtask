import { writable, derived } from 'svelte/store';
import type { CalendarEvent } from '../types';
import { todosWithDate } from './todoStore';

/**
 * Store des événements calendrier
 * CalendarEvent ne contient que des références vers les Todos
 */
export const calendarEvents = writable<CalendarEvent[]>([]);

/**
 * Semaine courante (début de semaine)
 */
export const currentWeekStart = writable<Date>(getStartOfWeek(new Date()));

/**
 * Jours de la semaine courante (7 jours)
 */
export const daysInWeek = derived(currentWeekStart, ($weekStart) => {
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date($weekStart);
    day.setDate($weekStart.getDate() + i);
    days.push(day);
  }
  return days;
});

/**
 * Helper : Obtenir le début de la semaine (lundi)
 */
function getStartOfWeek(date: Date): Date {
  const day = date.getDay(); // 0 for Sunday, 1 for Monday
  const diff = date.getDate() - (day === 0 ? 6 : day - 1); // Adjust for Monday start
  return new Date(date.getFullYear(), date.getMonth(), diff);
}

/**
 * Actions pour naviguer dans le calendrier
 */
export function goToPreviousWeek() {
  currentWeekStart.update(week => {
    const newWeek = new Date(week);
    newWeek.setDate(week.getDate() - 7);
    return newWeek;
  });
}

export function goToNextWeek() {
  currentWeekStart.update(week => {
    const newWeek = new Date(week);
    newWeek.setDate(week.getDate() + 7);
    return newWeek;
  });
}

export function goToToday() {
  currentWeekStart.set(getStartOfWeek(new Date()));
}

/**
 * Initialiser les événements calendrier depuis les todos avec date
 */
export function initializeCalendarEvents() {
  todosWithDate.subscribe($todosWithDate => {
    const events: CalendarEvent[] = $todosWithDate.map(todo => ({
      todoId: todo.id,
    }));
    calendarEvents.set(events);
  });
}
