import { writable, derived, get } from 'svelte/store';
import type { CalendarEvent } from '../types';
import { todosWithDate } from './todoStore';

/**
 * Store des événements calendrier
 * CalendarEvent ne contient que des références vers les Todos
 */
export const calendarEvents = writable<CalendarEvent[]>([]);

/**
 * Type de vue calendrier
 */
export type CalendarViewType = 'day' | 'threeDays' | 'week';

/**
 * Vue calendrier active
 */
export const calendarView = writable<CalendarViewType>('week');

/**
 * Date de début de la vue courante
 */
export const currentWeekStart = writable<Date>(getStartOfWeek(new Date()));

/**
 * Jours de la vue courante (1, 3 ou 7 jours selon la vue)
 */
export const daysInWeek = derived(
  [currentWeekStart, calendarView],
  ([$weekStart, $view]) => {
    const days: Date[] = [];
    const numDays = $view === 'day' ? 1 : $view === 'threeDays' ? 3 : 7;

    for (let i = 0; i < numDays; i++) {
      const day = new Date($weekStart);
      day.setDate($weekStart.getDate() + i);
      days.push(day);
    }
    return days;
  }
);

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
  const view = get(calendarView);
  const daysToMove = view === 'day' ? 1 : view === 'threeDays' ? 3 : 7;

  currentWeekStart.update(week => {
    const newWeek = new Date(week);
    newWeek.setDate(week.getDate() - daysToMove);
    return newWeek;
  });
}

export function goToNextWeek() {
  const view = get(calendarView);
  const daysToMove = view === 'day' ? 1 : view === 'threeDays' ? 3 : 7;

  currentWeekStart.update(week => {
    const newWeek = new Date(week);
    newWeek.setDate(week.getDate() + daysToMove);
    return newWeek;
  });
}

export function goToToday() {
  const view = get(calendarView);

  if (view === 'day') {
    // Vue jour : aller à aujourd'hui
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    currentWeekStart.set(today);
  } else if (view === 'threeDays') {
    // Vue 3 jours : centrer sur aujourd'hui (aujourd'hui au milieu)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    today.setDate(today.getDate() - 1); // Commencer à hier pour avoir aujourd'hui au centre
    currentWeekStart.set(today);
  } else {
    // Vue semaine : aller au début de la semaine
    currentWeekStart.set(getStartOfWeek(new Date()));
  }
}

/**
 * Changer la vue du calendrier
 */
export function setCalendarView(view: CalendarViewType) {
  calendarView.set(view);
  // Réajuster la position pour être cohérent avec la nouvelle vue
  goToToday();
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
