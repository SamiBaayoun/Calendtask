import { writable } from 'svelte/store';
import type { Todo, Priority, Status, TodoColor } from '../types';

/**
 * Todo sélectionné (pour affichage des détails, édition, etc.)
 */
export const selectedTodo = writable<Todo | null>(null);

/**
 * Tags collapsed (fold/unfold)
 */
export const collapsedTags = writable<Set<string>>(new Set());

/**
 * Couleurs des tags (Map: tag -> couleur)
 */
export const tagColors = writable<Map<string, TodoColor>>(new Map());

/**
 * Recherche
 */
export const searchQuery = writable<string>('');

/**
 * Cacher les todos terminés
 */
export const hideCompleted = writable<boolean>(true);

/**
 * Cacher les tags vides (sans todos)
 */
export const hideEmptyTags = writable<boolean>(true);

/**
 * Filtres actifs
 */
export const activeFilters = writable<{
  tags: string[];
  priorities: Priority[];
  status: Status[];
}>({
  tags: [],
  priorities: [],
  status: [],
});

/**
 * Actions pour gérer les tags collapsed
 */
export function toggleTagCollapsed(tag: string) {
  collapsedTags.update(tags => {
    const newTags = new Set(tags);
    if (newTags.has(tag)) {
      newTags.delete(tag);
    } else {
      newTags.add(tag);
    }
    return newTags;
  });
}

/**
 * Actions pour gérer les filtres
 */
export function addTagFilter(tag: string) {
  activeFilters.update(filters => ({
    ...filters,
    tags: [...filters.tags, tag],
  }));
}

export function removeTagFilter(tag: string) {
  activeFilters.update(filters => ({
    ...filters,
    tags: filters.tags.filter(t => t !== tag),
  }));
}

export function clearFilters() {
  activeFilters.set({
    tags: [],
    priorities: [],
    status: [],
  });
}

/**
 * Actions pour gérer les couleurs de tags
 */
export function setTagColor(tag: string, color: TodoColor) {
  tagColors.update(colors => {
    const newColors = new Map(colors);
    newColors.set(tag, color);
    return newColors;
  });
}

export function getTagColor(tag: string, colors: Map<string, TodoColor>): TodoColor | undefined {
  return colors.get(tag);
}
