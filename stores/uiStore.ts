import { writable } from 'svelte/store';
import type { Todo, Priority, Status } from '../types';

/**
 * Todo sélectionné (pour affichage des détails, édition, etc.)
 */
export const selectedTodo = writable<Todo | null>(null);

/**
 * Tags collapsed (fold/unfold)
 */
export const collapsedTags = writable<Set<string>>(new Set());

/**
 * Recherche
 */
export const searchQuery = writable<string>('');

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
