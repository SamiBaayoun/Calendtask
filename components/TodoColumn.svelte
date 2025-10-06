<script lang="ts">
  import TagGroup from './TagGroup.svelte';
  import { tagGroups } from '../stores/todoStore';
  import { searchQuery } from '../stores/uiStore';

  let query = '';

  // Mettre à jour le store lors de la recherche
  function handleSearch(event: Event) {
    const target = event.target as HTMLInputElement;
    query = target.value;
    searchQuery.set(query);
  }
</script>

<div class="todo-column">
  <div class="todo-header">
    <h3>Mes Tâches</h3>
    <input
      type="text"
      class="search-input"
      placeholder="🔍 Rechercher..."
      value={query}
      on:input={handleSearch}
    />
  </div>

  <div class="todo-list">
    {#each $tagGroups as group (group.tag)}
      <TagGroup {group} />
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
    display: flex;
    flex-direction: column;
  }

  .todo-header {
    margin-bottom: 15px;
  }

  .todo-header h3 {
    margin: 0 0 10px 0;
    font-size: 1.2em;
    font-weight: 600;
  }

  .search-input {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background-color: var(--background-secondary);
    color: var(--text-normal);
    font-size: 0.9em;
  }

  .search-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
  }

  .todo-list {
    flex-grow: 1;
    display: flex;
    flex-direction: column;
  }
</style>
