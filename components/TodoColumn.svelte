<script lang="ts">
  import TagGroup from './TagGroup.svelte';
  import { tagGroupsWithoutDate } from '../stores/todoStore';
  import { searchQuery, hideCompleted } from '../stores/uiStore';

  let query = '';

  // Mettre à jour le store lors de la recherche
  function handleSearch(event: Event) {
    const target = event.target as HTMLInputElement;
    query = target.value;
    searchQuery.set(query);
  }

  function toggleHideCompleted() {
    hideCompleted.update(v => !v);
  }
</script>

<div class="todo-column">
  <div class="todo-header">
    <div class="header-row">
      <h3>Mes Tâches</h3>
      <button
        class="toggle-completed-btn"
        class:active={$hideCompleted}
        on:click={toggleHideCompleted}
        aria-label={$hideCompleted ? 'Afficher les tâches terminées' : 'Cacher les tâches terminées'}
      >
        {$hideCompleted ? '👁️‍🗨️' : '👁️'}
        <span class="btn-tooltip">
          {$hideCompleted ? 'Afficher les terminées' : 'Cacher les terminées'}
        </span>
      </button>
    </div>
    <input
      type="text"
      class="search-input"
      placeholder="🔍 Rechercher..."
      value={query}
      on:input={handleSearch}
    />
  </div>

  <div class="todo-list">
    {#each $tagGroupsWithoutDate as group (group.tag)}
      <TagGroup {group} hideCompletedTodos={$hideCompleted} />
    {/each}
  </div>
</div>

<style>
  .todo-column {
    width: 250px;
    padding: 10px;
    border-right: 1px solid var(--background-modifier-border);
    background-color: var(--background-secondary);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .todo-header {
    margin-bottom: 15px;
  }

  .header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  .todo-header h3 {
    margin: 0;
    font-size: 1.2em;
    font-weight: 600;
  }

  .toggle-completed-btn {
    background: transparent;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    padding: 4px 8px;
    cursor: pointer;
    font-size: 1em;
    transition: all 0.15s ease;
    opacity: 0.7;
    position: relative;
    flex-shrink: 0;
  }

  .toggle-completed-btn:hover {
    opacity: 1;
    border-color: var(--interactive-accent);
    background-color: var(--background-modifier-hover);
  }

  .toggle-completed-btn.active {
    opacity: 1;
    background-color: var(--interactive-accent);
    border-color: var(--interactive-accent);
  }

  .btn-tooltip {
    position: absolute;
    bottom: calc(100% + 8px);
    right: 0;
    background-color: var(--background-secondary);
    color: var(--text-normal);
    padding: 6px 10px;
    border-radius: 4px;
    font-size: 0.8em;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    border: 1px solid var(--background-modifier-border);
    z-index: 100;
  }

  .toggle-completed-btn:hover .btn-tooltip {
    opacity: 1;
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
