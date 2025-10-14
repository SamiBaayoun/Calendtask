<script lang="ts">
  import { getContext } from 'svelte';
  import type CalendTaskPlugin from '../main';
  import { CalendarTodoService } from '../services/CalendarTodoService';
  import { calendarOnlyTodos } from '../stores/todoStore';

  export let date: string; // Format YYYY-MM-DD
  export let time: string; // Format HH:MM
  export let onClose: () => void;

  const plugin = getContext<CalendTaskPlugin>('plugin');

  let todoText = '';
  let todoDate = date;
  let todoTime = time;

  async function handleCreate() {
    if (!todoText.trim()) {
      return;
    }

    // Create the calendar-only todo
    const newTodo = CalendarTodoService.createTodo(
      todoText.trim(),
      todoDate,
      todoTime,
      30 // Default duration
    );

    // Save to plugin data
    await plugin.addCalendarOnlyTodo(newTodo);

    // Update the store
    calendarOnlyTodos.update(todos => [...todos, newTodo]);

    onClose();
  }

  function handleCancel() {
    onClose();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleCreate();
    } else if (event.key === 'Escape') {
      handleCancel();
    }
  }
</script>

<div class="modal-backdrop" on:click={handleCancel}>
  <div class="modal-content" on:click|stopPropagation>
    <div class="modal-header">
      <h3>Create Task</h3>
    </div>

    <div class="modal-body">
      <div class="form-group">
        <label for="todo-text">Task</label>
        <input
          id="todo-text"
          type="text"
          class="todo-input"
          bind:value={todoText}
          placeholder="What needs to be done?"
          on:keydown={handleKeyDown}
          autofocus
        />
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="todo-date">Date</label>
          <input
            id="todo-date"
            type="date"
            class="date-input"
            bind:value={todoDate}
          />
        </div>

        <div class="form-group">
          <label for="todo-time">Time</label>
          <input
            id="todo-time"
            type="time"
            class="time-input"
            bind:value={todoTime}
          />
        </div>
      </div>
    </div>

    <div class="modal-footer">
      <button class="btn btn-cancel" on:click={handleCancel}>
        Cancel
      </button>
      <button class="btn btn-primary" on:click={handleCreate} disabled={!todoText.trim()}>
        Create
      </button>
    </div>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  }

  .modal-content {
    background-color: var(--background-primary);
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    min-width: 400px;
    max-width: 500px;
    border: 1px solid var(--background-modifier-border);
  }

  .modal-header {
    padding: 16px 20px;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .modal-header h3 {
    margin: 0;
    font-size: 1.1em;
    font-weight: 600;
    color: var(--text-normal);
  }

  .modal-body {
    padding: 20px;
  }

  .form-group {
    margin-bottom: 16px;
  }

  .form-group:last-child {
    margin-bottom: 0;
  }

  .form-row {
    display: flex;
    gap: 12px;
  }

  .form-row .form-group {
    flex: 1;
  }

  label {
    display: block;
    margin-bottom: 6px;
    font-size: 0.9em;
    font-weight: 500;
    color: var(--text-muted);
  }

  .todo-input,
  .date-input,
  .time-input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background-color: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.95em;
  }

  .todo-input:focus,
  .date-input:focus,
  .time-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
  }

  .modal-footer {
    padding: 12px 20px;
    border-top: 1px solid var(--background-modifier-border);
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .btn {
    padding: 8px 16px;
    border-radius: 4px;
    border: none;
    font-size: 0.9em;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-cancel {
    background-color: transparent;
    color: var(--text-muted);
    border: 1px solid var(--background-modifier-border);
  }

  .btn-cancel:hover {
    background-color: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .btn-primary {
    background-color: var(--interactive-accent);
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background-color: var(--interactive-accent-hover);
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
