import type { TodoColor, Todo } from '../types';

export const TODO_COLORS: Record<TodoColor, { name: string; bg: string; text: string }> = {
  gray: {
    name: 'Gris',
    bg: '#9ca3af',
    text: '#ffffff'
  },
  red: {
    name: 'Rouge',
    bg: '#fca5a5',
    text: '#7f1d1d'
  },
  orange: {
    name: 'Orange',
    bg: '#fdba74',
    text: '#7c2d12'
  },
  yellow: {
    name: 'Jaune',
    bg: '#fde047',
    text: '#713f12'
  },
  green: {
    name: 'Vert',
    bg: '#86efac',
    text: '#14532d'
  },
  blue: {
    name: 'Bleu',
    bg: '#93c5fd',
    text: '#1e3a8a'
  },
  purple: {
    name: 'Violet',
    bg: '#c4b5fd',
    text: '#4c1d95'
  },
  pink: {
    name: 'Rose',
    bg: '#f9a8d4',
    text: '#831843'
  }
};

export function getTodoColor(color?: TodoColor): { bg: string; text: string } {
  return TODO_COLORS[color || 'gray'];
}

/**
 * Retourne la couleur d'un todo basée sur ses tags et la map de couleurs de tags
 */
export function getTodoColorFromTags(todo: Todo, tagColors: Map<string, TodoColor>): { bg: string; text: string } {
  // Si le todo est calendar-only et a une couleur personnalisée, utiliser cette couleur
  if (todo.isCalendarOnly && todo.color) {
    return TODO_COLORS[todo.color];
  }

  // Si le todo a des tags, utiliser la couleur du premier tag qui a une couleur
  if (todo.tags && todo.tags.length > 0) {
    for (const tag of todo.tags) {
      const color = tagColors.get(tag);
      if (color) {
        return TODO_COLORS[color];
      }
    }
  } else {
    // Si le todo n'a pas de tags, vérifier s'il y a une couleur définie pour les todos sans tag (clé vide)
    const noTagColor = tagColors.get('');
    if (noTagColor) {
      return TODO_COLORS[noTagColor];
    }
  }

  // Par défaut : gris
  return TODO_COLORS.gray;
}
