// ============================================================================
// Core Types
// ============================================================================

export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type Status = 'todo' | 'in-progress' | 'done' | 'cancelled';
export type RecurrenceType = 'daily' | 'weekly' | 'monthly' | 'yearly';

// ============================================================================
// Recurrence Pattern
// ============================================================================

export interface RecurrencePattern {
  type: RecurrenceType;
  interval: number;           // Ex: tous les 2 jours
  endDate?: string;           // Date de fin de récurrence (YYYY-MM-DD)
  daysOfWeek?: number[];      // Pour récurrence hebdomadaire (0=dimanche, 6=samedi)
}

// ============================================================================
// Todo Interface
// ============================================================================

export interface Todo {
  // Identifiant unique
  id: string;

  // Contenu
  text: string;               // Description de la tâche

  // Temporalité
  date?: string;              // Date au format ISO (YYYY-MM-DD) - optionnelle
  time?: string;              // Heure au format HH:MM - optionnelle
  duration?: number;          // Durée estimée en minutes - optionnelle

  // Organisation
  tags: string[];             // Liste des tags (ex: ["work", "urgent"])
  priority?: Priority;

  // Statut
  status: Status;

  // Métadonnées Obsidian
  filePath: string;           // Chemin du fichier dans le vault
  lineNumber?: number;        // Numéro de ligne si tâche extraite d'une liste

  // Récurrence
  recurrence?: RecurrencePattern;      // Pour les tâches récurrentes
  parentRecurrenceId?: string;         // Si c'est une exception à une récurrence
  isRecurrenceException?: boolean;     // true si créé comme override d'une instance

  // Extras
  subtasks?: Todo[];          // Sous-tâches
  notes?: string;             // Notes additionnelles
}

// ============================================================================
// Calendar Event Interface
// ============================================================================

/**
 * CalendarEvent est une simple référence vers un Todo.
 * Toutes les propriétés (date, heure, durée, etc.) sont calculées
 * à la volée depuis le Todo référencé.
 */
export interface CalendarEvent {
  todoId: string;             // Référence vers le Todo source
  instanceDate?: Date;        // Pour récurrences : date de cette occurrence spécifique
}

// ============================================================================
// Tag Group Interface
// ============================================================================

export interface TagGroup {
  tag: string;
  todos: Todo[];
  isCollapsed: boolean;       // État du fold/unfold
  color?: string;             // Couleur personnalisée pour le tag
}

// ============================================================================
// App State Interface
// ============================================================================

export interface AppState {
  // Données
  todos: Todo[];
  calendarEvents: CalendarEvent[];
  tagGroups: TagGroup[];

  // UI State
  currentWeekStart: Date;
  selectedTodo: Todo | null;
  collapsedTags: Set<string>;
  searchQuery: string;

  // Filtres
  activeFilters: {
    tags: string[];
    priorities: Priority[];
    status: Status[];
  };
}

// ============================================================================
// Plugin Settings
// ============================================================================

export interface CalendTaskSettings {
  defaultDuration: number;              // Durée par défaut en minutes (30)
  weekStartDay: 'monday' | 'sunday';    // Jour de début de semaine
  timeFormat: '12h' | '24h';            // Format d'affichage de l'heure
  showSyncNotifications: boolean;       // Afficher les notifications de sync

  // Comportement
  snapToMinutes: number;                // Snapping en minutes (15, 30, 60)

  // Apparence
  firstHourOfDay: number;               // Première heure affichée (0-23)
  lastHourOfDay: number;                // Dernière heure affichée (0-23)
}

export const DEFAULT_SETTINGS: CalendTaskSettings = {
  defaultDuration: 30,
  weekStartDay: 'monday',
  timeFormat: '24h',
  showSyncNotifications: false,
  snapToMinutes: 30,
  firstHourOfDay: 0,
  lastHourOfDay: 23,
};
