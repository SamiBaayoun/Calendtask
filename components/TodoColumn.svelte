<script lang="ts">
  import TagGroup from './TagGroup.svelte';
  import { tagGroupsWithoutDate } from '../stores/todoStore';
  import { searchQuery, hideCompleted, hideEmptyTags } from '../stores/uiStore';

  let query = '';
  let showMenu = false;

  // Mettre à jour le store lors de la recherche
  function handleSearch(event: Event) {
    const target = event.target as HTMLInputElement;
    query = target.value;
    searchQuery.set(query);
  }

  function toggleMenu() {
    showMenu = !showMenu;
  }

  function toggleHideCompleted() {
    hideCompleted.update(v => !v);
  }

  function toggleHideEmptyTags() {
    hideEmptyTags.update(v => !v);
  }

  // Fermer le menu si on clique ailleurs
  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.menu-container')) {
      showMenu = false;
    }
  }

  // Filtrer les groupes vides si l'option est activée
  $: filteredGroups = $hideEmptyTags
    ? $tagGroupsWithoutDate.filter(group => {
        const visibleTodos = $hideCompleted
          ? group.todos.filter(todo => todo.status !== 'done')
          : group.todos;
        return visibleTodos.length > 0;
      })
    : $tagGroupsWithoutDate;
</script>

<svelte:window on:click={handleClickOutside} />

<div class="todo-column">
  <div class="todo-header">
    <div class="header-row">
      <h3>My Tasks</h3>
      <div class="menu-container">
        <button
          class="menu-btn"
          on:click|stopPropagation={toggleMenu}
          aria-label="Options menu"
        >
          ⋯
        </button>
        {#if showMenu}
          <div class="dropdown-menu">
            <button
              class="menu-item"
              on:click|stopPropagation={toggleHideCompleted}
            >
              <span class="menu-label">Hide completed</span>
              <div class="toggle-switch" class:active={$hideCompleted}>
                <div class="toggle-thumb"></div>
              </div>
            </button>
            <button
              class="menu-item"
              on:click|stopPropagation={toggleHideEmptyTags}
            >
              <span class="menu-label">Hide empty tags</span>
              <div class="toggle-switch" class:active={$hideEmptyTags}>
                <div class="toggle-thumb"></div>
              </div>
            </button>
          </div>
        {/if}
      </div>
    </div>
    <input
      type="text"
      class="search-input"
      placeholder="🔍 Search..."
      value={query}
      on:input={handleSearch}
    />
  </div>

  <div class="todo-list">
    {#each filteredGroups as group (group.tag)}
      <TagGroup {group} hideCompletedTodos={$hideCompleted} />
    {/each}
  </div>
</div>

<style>
  .todo-column {
    width: 250px;
    padding: 0;
    border-right: 1px solid var(--background-modifier-border);
    background-color: var(--background-secondary);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .todo-header {
    padding: 14px 14px 12px;
  }

  .header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  .todo-header h3 {
    margin: 0;
    font-size: var(--ct-fs-title, 1.15em);
    font-weight: 600;
    letter-spacing: -.01em;
    color: var(--text-normal);
  }

  .menu-container {
    position: relative;
    flex-shrink: 0;
  }

  .menu-btn {
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    padding: 5px 8px;
    cursor: pointer;
    font-size: 1.1em;
    line-height: 1;
    transition: background .12s, color .12s, border-color .12s;
    color: var(--text-muted);
  }

  .menu-btn:hover {
    background: var(--background-modifier-hover);
    border-color: var(--background-modifier-border);
    color: var(--text-normal);
  }

  .dropdown-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    background-color: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--ct-radius, 8px);
    box-shadow: 0 16px 48px rgba(0, 0, 0, .4), 0 2px 8px rgba(0, 0, 0, .2);
    z-index: 1000;
    min-width: 232px;
    padding: 6px;
  }

  .menu-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    padding: 9px 10px;
    background: transparent;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    color: var(--text-normal);
    font-size: var(--ct-fs-ui, 0.875em);
    text-align: left;
    transition: background .12s;
  }

  .menu-item:hover {
    background-color: var(--background-modifier-hover);
  }

  .menu-label {
    flex: 1;
    font-weight: 500;
  }

  /* Toggle Switch */
  .toggle-switch {
    position: relative;
    width: 34px;
    height: 19px;
    background-color: var(--background-modifier-border);
    border-radius: 10px;
    transition: background-color .25s ease;
    flex-shrink: 0;
  }

  .toggle-switch.active {
    background-color: var(--interactive-accent);
  }

  .toggle-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 15px;
    height: 15px;
    background-color: var(--background-primary);
    border-radius: 50%;
    transition: transform .25s ease;
    box-shadow: 0 1px 2px rgba(0, 0, 0, .3);
  }

  .toggle-switch.active .toggle-thumb {
    transform: translateX(15px);
  }

  .search-input {
    width: 100%;
    box-sizing: border-box;
    padding: 7px 10px;
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--ct-radius-sm, 6px);
    background-color: var(--background-primary);
    color: var(--text-normal);
    font-size: var(--ct-fs-ui, 0.875em);
    transition: border-color .12s, box-shadow .12s;
  }

  .search-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--interactive-accent) 22%, transparent);
  }

  .todo-list {
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    padding: 4px 10px 16px;
  }
</style>
