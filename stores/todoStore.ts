import { writable, derived } from 'svelte/store';
import type { Todo, TagGroup } from '../types';
import { searchQuery } from './uiStore';

/**
 * Store principal des todos
 */
export const todos = writable<Todo[]>([]);

/**
 * Store dérivé : Todos filtrés par recherche
 */
export const filteredTodos = derived([todos, searchQuery], ([$todos, $searchQuery]) => {
  if (!$searchQuery || $searchQuery.trim() === '') {
    return $todos;
  }

  const query = $searchQuery.toLowerCase();
  return $todos.filter(todo => {
    // Recherche dans le texte
    if (todo.text.toLowerCase().includes(query)) return true;

    // Recherche dans les tags
    if (todo.tags.some(tag => tag.toLowerCase().includes(query))) return true;

    // Recherche dans la priorité
    if (todo.priority?.toLowerCase().includes(query)) return true;

    return false;
  });
});

/**
 * Store dérivé : Grouper les todos par tags
 */
export const tagGroups = derived(filteredTodos, ($filteredTodos) => {
  const groups = new Map<string, TagGroup>();

  // Groupe "Sans tag" pour les todos sans tag
  groups.set('_no_tag', {
    tag: '',
    todos: [],
    isCollapsed: false,
  });

  // Grouper par tag
  $filteredTodos.forEach((todo) => {
    if (todo.tags.length === 0) {
      groups.get('_no_tag')!.todos.push(todo);
    } else {
      todo.tags.forEach((tag) => {
        if (!groups.has(tag)) {
          groups.set(tag, {
            tag,
            todos: [],
            isCollapsed: false,
          });
        }
        groups.get(tag)!.todos.push(todo);
      });
    }
  });

  // Convertir en tableau et trier par nom de tag
  return Array.from(groups.values())
    .filter(group => group.todos.length > 0)
    .sort((a, b) => {
      // "Sans tag" en dernier
      if (a.tag === '') return 1;
      if (b.tag === '') return -1;
      return a.tag.localeCompare(b.tag);
    });
});

/**
 * Store dérivé : Todos filtrés (sans date = restent dans la colonne)
 */
export const todosWithoutDate = derived(todos, ($todos) => {
  return $todos.filter(todo => !todo.date);
});

/**
 * Store dérivé : Todos avec date (pour le calendrier)
 */
export const todosWithDate = derived(todos, ($todos) => {
  return $todos.filter(todo => todo.date);
});
