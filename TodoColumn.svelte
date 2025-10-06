<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  interface Todo {
    id: string;
    text: string;
  }

  let todos: Todo[] = [
    { id: '1', text: 'Exemple de tâche 1' },
    { id: '2', text: 'Exemple de tâche 2' },
    { id: '3', text: 'Exemple de tâche 3' },
  ];

  let draggedTodo: Todo | null = null;

  const dispatch = createEventDispatcher();

  function handleDragStart(event: DragEvent, todo: Todo) {
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', JSON.stringify({ id: todo.id, text: todo.text }));
      // Créer une image fantôme semi-transparente
      const ghost = document.createElement('div');
      ghost.classList.add('todo-item-ghost');
      ghost.textContent = todo.text;
      document.body.appendChild(ghost);
      event.dataTransfer.setDragImage(ghost, 0, 0);
      // Supprimer le fantôme après un court délai pour qu'il ne soit pas visible sur la page
      setTimeout(() => document.body.removeChild(ghost), 0);
    }
    draggedTodo = todo;
  }

  function handleDragEnd() {
    draggedTodo = null;
  }
</script>

<div class="todo-column">
  <h3>Mes Tâches</h3>
  <div class="todo-list">
    {#each todos as todo (todo.id)}
      <div
        class="todo-item"
        draggable="true"
        role="listitem"
        on:dragstart={(e) => handleDragStart(e, todo)}
        on:dragend={handleDragEnd}
      >
        {todo.text}
      </div>
    {/each}
  </div>
</div>

<style>
  .todo-column {
    width: 250px;
    padding: 10px;
    border-right: 1px solid var(--background-modifier-border);
    background-color: var(--background-primary);
    overflow-y: auto;
  }

  .todo-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .todo-item {
    background-color: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    padding: 10px;
    cursor: grab;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .todo-item:active {
    cursor: grabbing;
  }
</style>