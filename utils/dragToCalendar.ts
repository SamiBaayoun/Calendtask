import { dragState, dropTarget, pendingDrop, type DragTask, type DropTarget } from '../stores/dragStore';

const HOUR_PX    = 60;
const GRID_START = 0;
const GRID_END   = 24;
const THRESHOLD  = 5;

export function dragToCalendar(node: HTMLElement, task: DragTask) {
  let currentTask = task;

  function onMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;

    const startX = e.clientX;
    const startY = e.clientY;
    let active = false;

    // Defer to let other mousedown handlers (e.g. resize zones) run first
    queueMicrotask(() => {
      if (e.defaultPrevented) return;

      function onMove(ev: MouseEvent) {
        if (!active && Math.hypot(ev.clientX - startX, ev.clientY - startY) > THRESHOLD) {
          active = true;
          dragState.set({ task: currentTask, active: true });
          document.body.style.cursor = 'grabbing';
          document.body.style.userSelect = 'none';
        }
        if (!active) return;

        const el  = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
        const col = el?.closest('.day-col') as HTMLElement | null;
        if (col && col.dataset.day != null) {
          const day  = +col.dataset.day;
          const rect = col.getBoundingClientRect();
          let h = GRID_START + (ev.clientY - rect.top) / HOUR_PX;
          h = Math.max(GRID_START, Math.min(GRID_END - 1, Math.round(h * 2) / 2));
          dropTarget.set({ day, start: h, text: currentTask.title });
        } else {
          dropTarget.set(null);
        }
      }

      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        if (active) {
          let captured: DropTarget | null = null;
          dropTarget.update((dt) => { captured = dt; return null; });
          if (captured) pendingDrop.set({ task: currentTask, target: captured });
        }
        dragState.set({ task: null, active: false });
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  node.addEventListener('mousedown', onMouseDown);

  return {
    update(next: DragTask) { currentTask = next; },
    destroy() { node.removeEventListener('mousedown', onMouseDown); },
  };
}
