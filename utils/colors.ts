import type { TodoColor, Todo } from '../types';

export const TODO_COLORS: Record<TodoColor, { name: string; bg: string; text: string }> = {
  indigo: {
    name: 'Indigo',
    bg: '#a5b4fc',
    text: '#312e81'
  },
  blue: {
    name: 'Bleu',
    bg: '#93c5fd',
    text: '#1e3a8a'
  },
  cyan: {
    name: 'Cyan',
    bg: '#67e8f9',
    text: '#164e63'
  },
  green: {
    name: 'Vert',
    bg: '#86efac',
    text: '#14532d'
  },
  citron: {
    name: 'Citron',
    bg: '#d9f99d',
    text: '#365314'
  },
  amber: {
    name: 'Ambre',
    bg: '#fcd34d',
    text: '#78350f'
  },
  coral: {
    name: 'Corail',
    bg: '#fdba74',
    text: '#7c2d12'
  },
  magenta: {
    name: 'Magenta',
    bg: '#f0abfc',
    text: '#701a75'
  }
};

export function getTodoColor(color?: TodoColor): { bg: string; text: string } {
  return TODO_COLORS[color as TodoColor] || TODO_COLORS.indigo;
}

export function getTodoColorFromTags(todo: Todo, tagColors: Map<string, TodoColor>): { bg: string; text: string } {
  if (todo.isCalendarOnly && todo.color) {
    return TODO_COLORS[todo.color];
  }

  if (todo.tags && todo.tags.length > 0) {
    for (const tag of todo.tags) {
      const color = tagColors.get(tag);
      if (color) {
        return TODO_COLORS[color];
      }
    }
  } else {
    const noTagColor = tagColors.get('');
    if (noTagColor) {
      return TODO_COLORS[noTagColor];
    }
  }

  return TODO_COLORS.indigo;
}
