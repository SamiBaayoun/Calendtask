import type CalendTaskPlugin from '../main';
import type { Todo } from '../types';
import { CalendarTodoService } from './CalendarTodoService';
import {
  activeTimer,
  startTimer,
  pauseTimer,
  resumeTimer,
  stopTimer,
  type TimerState
} from '../stores/timerStore';
import { get } from 'svelte/store';
import { todos as todosStore, calendarOnlyTodos } from '../stores/todoStore';

/**
 * Service de gestion des timers pour les tâches
 */
export class TimerService {
  private plugin: CalendTaskPlugin;

  constructor(plugin: CalendTaskPlugin) {
    this.plugin = plugin;
  }

  /**
   * Démarre un timer pour une tâche
   * - Arrête le timer actuel si existe
   * - Crée une tâche calendarOnly à l'heure actuelle
   * - Démarre le timer
   */
  async startTimerForTodo(todo: Todo): Promise<void> {
    // Arrêter le timer actuel s'il existe
    const currentTimer = get(activeTimer);
    if (currentTimer) {
      await this.stopCurrentTimer();
    }

    // Créer une tâche calendarOnly à l'heure actuelle
    const now = new Date();
    const date = this.formatDate(now);
    const time = this.formatTime(now);

    // Créer la tâche calendarOnly
    const calendarTodo = CalendarTodoService.createTodo(
      todo.text,
      date,
      time,
      this.plugin.settings.defaultDuration
    );

    // Copier les tags et la priorité de la tâche source
    calendarTodo.tags = todo.tags ? [...todo.tags] : [];
    calendarTodo.priority = todo.priority;

    // Copier les informations de fichier pour pouvoir ouvrir la note associée
    calendarTodo.filePath = todo.filePath;
    calendarTodo.lineNumber = todo.lineNumber;

    // Ajouter la tâche au calendrier
    await this.plugin.addCalendarOnlyTodo(calendarTodo);

    // Mettre à jour le store pour rafraîchir l'UI
    calendarOnlyTodos.set(this.plugin.getCalendarOnlyTodos());

    // Démarrer le timer
    startTimer(todo.id, calendarTodo.id);

    // Sauvegarder l'état
    await this.saveTimerState();
  }

  /**
   * Met le timer actuel en pause
   */
  async pauseCurrentTimer(): Promise<void> {
    const timer = get(activeTimer);
    if (!timer || timer.isPaused) return;

    // Mettre en pause
    pauseTimer();

    // Calculer la durée actuelle et mettre à jour la tâche calendarOnly
    await this.updateCalendarTodoDuration(get(activeTimer));

    // Mettre à jour le store pour rafraîchir l'UI
    calendarOnlyTodos.set(this.plugin.getCalendarOnlyTodos());

    // Sauvegarder l'état
    await this.saveTimerState();
  }

  /**
   * Relance le timer après une pause
   */
  async resumeCurrentTimer(): Promise<void> {
    const timer = get(activeTimer);
    if (!timer || !timer.isPaused) return;

    // Relancer
    resumeTimer();

    // Sauvegarder l'état
    await this.saveTimerState();
  }

  /**
   * Arrête le timer actuel
   */
  async stopCurrentTimer(): Promise<void> {
    const result = stopTimer();
    if (!result) return;

    // Calculer la durée totale en minutes
    const durationMinutes = Math.ceil(result.duration / 60000); // ms -> minutes, arrondi au supérieur

    // Mettre à jour la tâche calendarOnly avec la durée finale
    await this.plugin.updateCalendarOnlyTodo(result.calendarTodoId, {
      duration: durationMinutes,
    });

    // Mettre à jour le store pour rafraîchir l'UI
    calendarOnlyTodos.set(this.plugin.getCalendarOnlyTodos());

    // Clear l'état sauvegardé
    await this.clearTimerState();
  }

  /**
   * Toggle timer pour une tâche
   * - Si même tâche avec timer actif : toggle pause/resume
   * - Si autre tâche : démarre nouveau timer
   */
  async toggleTimerForTodo(todo: Todo): Promise<void> {
    const timer = get(activeTimer);

    if (timer && timer.todoId === todo.id) {
      // Même tâche : toggle pause/resume
      if (timer.isPaused) {
        await this.resumeCurrentTimer();
      } else {
        await this.pauseCurrentTimer();
      }
    } else {
      // Autre tâche : démarre nouveau timer
      await this.startTimerForTodo(todo);
    }
  }

  /**
   * Charge l'état du timer depuis les données du plugin
   */
  async loadTimerState(): Promise<void> {
    const timerState = this.plugin.data.timerState;
    if (!timerState) return;

    // Vérifier que la tâche calendarOnly existe encore
    const calendarTodos = this.plugin.getCalendarOnlyTodos();
    const calendarTodo = calendarTodos.find(t => t.id === timerState.calendarTodoId);

    if (!calendarTodo) {
      // La tâche a été supprimée, nettoyer le timer
      await this.clearTimerState();
      return;
    }

    // Restaurer le timer
    activeTimer.set(timerState);
  }

  /**
   * Appelé avant la fermeture d'Obsidian
   * Arrête le timer actif et sauvegarde l'état
   */
  async onUnload(): Promise<void> {
    const timer = get(activeTimer);
    if (timer) {
      await this.stopCurrentTimer();
    }
  }

  /**
   * Met à jour la durée de la tâche calendarOnly avec le temps écoulé
   */
  private async updateCalendarTodoDuration(timer: TimerState | null): Promise<void> {
    if (!timer) return;

    // Calculer la durée actuelle
    let duration: number;
    if (timer.isPaused) {
      duration = timer.pausedDuration;
    } else {
      duration = Date.now() - timer.startTime + timer.pausedDuration;
    }

    // Convertir en minutes (arrondi au supérieur)
    const durationMinutes = Math.ceil(duration / 60000);

    // Mettre à jour la tâche
    await this.plugin.updateCalendarOnlyTodo(timer.calendarTodoId, {
      duration: durationMinutes,
    });
  }

  /**
   * Sauvegarde l'état du timer dans les données du plugin
   */
  private async saveTimerState(): Promise<void> {
    const timer = get(activeTimer);
    this.plugin.data.timerState = timer;
    await this.plugin.savePluginData();
  }

  /**
   * Nettoie l'état du timer
   */
  private async clearTimerState(): Promise<void> {
    this.plugin.data.timerState = null;
    await this.plugin.savePluginData();
  }

  /**
   * Formate une date en YYYY-MM-DD
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Formate une heure en HH:MM
   */
  private formatTime(date: Date): string {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }
}
