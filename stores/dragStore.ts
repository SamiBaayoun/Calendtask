import { writable } from 'svelte/store';

export interface DragTask {
  id: string;
  title: string;
  durationMinutes?: number;
}

export interface DragState {
  task: DragTask | null;
  active: boolean;
}

export interface DropTarget {
  day: number;       // index into daysMetadata
  start: number;     // decimal hours, e.g. 14.5 = 14:30
  text: string;
  isAllDay?: boolean;
}

export const dragState   = writable<DragState>({ task: null, active: false });
export const dropTarget  = writable<DropTarget | null>(null);
export const pendingDrop = writable<{ task: DragTask; target: DropTarget } | null>(null);
