import { writable, derived, get } from 'svelte/store';

/**
 * État d'un timer actif
 */
export interface TimerState {
  todoId: string;              // ID tâche source (sidebar)
  calendarTodoId: string;      // ID tâche calendarOnly créée
  startTime: number;           // timestamp début (ms)
  pausedDuration: number;      // durée accumulée en pause (ms)
  isPaused: boolean;           // état pause
}

/**
 * Store du timer actif (un seul à la fois)
 */
export const activeTimer = writable<TimerState | null>(null);

/**
 * Store dérivé qui se met à jour automatiquement pour afficher le temps écoulé
 * Met à jour chaque seconde quand un timer est actif et non en pause
 */
export const timerElapsedTime = derived(
  activeTimer,
  ($activeTimer, set) => {
    if (!$activeTimer) {
      set(0);
      return;
    }

    // Fonction pour calculer le temps écoulé
    const calculateElapsed = () => {
      const timer = get(activeTimer);
      if (!timer) return 0;

      if (timer.isPaused) {
        // Si en pause, retourner seulement la durée accumulée
        return timer.pausedDuration;
      } else {
        // Si actif, calculer temps écoulé + durée en pause
        return Date.now() - timer.startTime + timer.pausedDuration;
      }
    };

    // Mettre à jour immédiatement
    set(calculateElapsed());

    // Si non en pause, mettre à jour chaque seconde
    let interval: number | undefined;
    if (!$activeTimer.isPaused) {
      interval = window.setInterval(() => {
        set(calculateElapsed());
      }, 1000);
    }

    // Cleanup
    return () => {
      if (interval !== undefined) {
        clearInterval(interval);
      }
    };
  },
  0
);

/**
 * Démarre un nouveau timer
 */
export function startTimer(todoId: string, calendarTodoId: string): void {
  activeTimer.set({
    todoId,
    calendarTodoId,
    startTime: Date.now(),
    pausedDuration: 0,
    isPaused: false,
  });
}

/**
 * Met le timer en pause
 */
export function pauseTimer(): void {
  activeTimer.update(timer => {
    if (!timer || timer.isPaused) return timer;

    // Calculer la durée écoulée et l'ajouter à pausedDuration
    const elapsed = Date.now() - timer.startTime;

    return {
      ...timer,
      pausedDuration: timer.pausedDuration + elapsed,
      isPaused: true,
      startTime: Date.now(), // Reset pour le prochain resume
    };
  });
}

/**
 * Relance le timer après une pause
 */
export function resumeTimer(): void {
  activeTimer.update(timer => {
    if (!timer || !timer.isPaused) return timer;

    return {
      ...timer,
      startTime: Date.now(),
      isPaused: false,
    };
  });
}

/**
 * Arrête le timer et retourne les informations
 */
export function stopTimer(): { todoId: string; calendarTodoId: string; duration: number } | null {
  const timer = get(activeTimer);
  if (!timer) return null;

  // Calculer la durée totale
  let totalDuration: number;
  if (timer.isPaused) {
    totalDuration = timer.pausedDuration;
  } else {
    totalDuration = Date.now() - timer.startTime + timer.pausedDuration;
  }

  const result = {
    todoId: timer.todoId,
    calendarTodoId: timer.calendarTodoId,
    duration: totalDuration,
  };

  // Clear le timer
  activeTimer.set(null);

  return result;
}

/**
 * Formate une durée en millisecondes en format MM:SS ou H:MM:SS
 */
export function formatTimerDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  } else {
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
}

/**
 * Vérifie si un todo a le timer actif
 */
export function hasActiveTimer(todoId: string): boolean {
  const timer = get(activeTimer);
  return timer?.todoId === todoId;
}
