<script lang="ts">
  import type { Todo } from '../types';

  export let day: Date;
  export let todos: Todo[];
  export let hideLabel: boolean = false;

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    // TODO: Gérer le drop dans la zone all-day
    const data = event.dataTransfer?.getData('text/plain');
    if (data) {
      const todoData = JSON.parse(data);
      console.log('Dropped in all-day zone:', todoData, 'on', day);
    }
  }
</script>

<div
  class="all-day-zone"
  on:dragover={handleDragOver}
  on:drop={handleDrop}
  role="region"
  aria-label="All-day events for {day.toLocaleDateString()}"
>
  {#if todos.length === 0 && !hideLabel}
    <div class="all-day-placeholder">Toute la journée</div>
  {:else}
    {#each todos as todo (todo.id)}
      <div class="all-day-event">
        {todo.text}
      </div>
    {/each}
  {/if}
</div>

<style>
  .all-day-zone {
    min-height: 40px;
    padding: 4px;
    background-color: var(--background-primary);
    border-bottom: 1px solid var(--background-modifier-border);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .all-day-placeholder {
    color: var(--text-faint);
    font-size: 0.75em;
    text-align: center;
    padding: 8px;
    font-style: italic;
  }

  .all-day-event {
    background-color: var(--interactive-accent);
    color: white;
    padding: 4px 8px;
    border-radius: 3px;
    font-size: 0.8em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }

  .all-day-event:hover {
    opacity: 0.9;
  }
</style>
