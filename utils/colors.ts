import type { TodoColor, Todo } from '../types';

export const TODO_COLORS: Record<TodoColor, { name: string; hue: number }> = {
  indigo:  { name: 'Indigo',  hue: 275 },
  blue:    { name: 'Bleu',    hue: 235 },
  cyan:    { name: 'Cyan',    hue: 200 },
  green:   { name: 'Vert',    hue: 150 },
  citron:  { name: 'Citron',  hue: 120 },
  amber:   { name: 'Ambre',   hue: 70  },
  coral:   { name: 'Corail',  hue: 30  },
  magenta: { name: 'Magenta', hue: 345 },
};

export function getTodoHue(color?: TodoColor): number {
  return TODO_COLORS[color as TodoColor]?.hue ?? 275;
}

export function getTodoHueFromTags(todo: Todo, tagColors: Map<string, TodoColor>): number {
  if (todo.isCalendarOnly && todo.color) {
    return TODO_COLORS[todo.color]?.hue ?? 275;
  }

  if (todo.tags && todo.tags.length > 0) {
    for (const tag of todo.tags) {
      const color = tagColors.get(tag);
      if (color) return TODO_COLORS[color]?.hue ?? 275;
    }
  } else {
    const noTagColor = tagColors.get('');
    if (noTagColor) return TODO_COLORS[noTagColor]?.hue ?? 275;
  }

  return 275;
}
