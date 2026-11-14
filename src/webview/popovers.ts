import { REFS_POPOVER_MIN_HEIGHT, REFS_POPOVER_MIN_WIDTH, anchoredPopoverPlacement, fitPopoverSpan, isPopoverEdge, resizePopoverRect } from '../shared/popover';
import type { AnchoredPopoverAlign, PopoverEdge, PopoverRect } from '../shared/popover';
import { persistView, state } from './state';
import { $ } from './dom';

export type AnchoredPopoverOpts = { align?: AnchoredPopoverAlign; maxWidth?: number };

export function lockPopoverWidth(pop: HTMLElement, width: number): void {
  const px = `${width}px`;
  pop.style.width = px;
  pop.style.minWidth = px;
  pop.style.maxWidth = px;
}

export function lockPopoverHeight(pop: HTMLElement, height: number | null): void {
  if (height == null) {
    pop.style.height = '';
    pop.style.minHeight = '';
    pop.style.maxHeight = '';
    pop.classList.remove('is-resized');
    return;
  }
  const px = `${height}px`;
  pop.style.height = px;
  pop.style.minHeight = px;
  pop.style.maxHeight = px;
  pop.classList.add('is-resized');
}

export function applyAnchoredPopoverPlacement(
  pop: HTMLElement,
  place: ReturnType<typeof anchoredPopoverPlacement>,
  fixed?: { width: number; height: number | null },
): void {
  pop.style.position = 'fixed';
  pop.style.inset = 'auto';
  pop.style.margin = '0';
  if (fixed) {
    lockPopoverWidth(pop, fitPopoverSpan(fixed.width, place.maxWidth, REFS_POPOVER_MIN_WIDTH));
    const available = window.innerHeight - place.top - 4;
    lockPopoverHeight(pop, fixed.height == null ? null : fitPopoverSpan(fixed.height, available, REFS_POPOVER_MIN_HEIGHT));
  } else {
    pop.style.width = 'max-content';
    pop.style.minWidth = '';
    pop.style.maxWidth = `${place.maxWidth}px`;
    pop.style.height = '';
    pop.style.minHeight = '';
    pop.style.maxHeight = '';
  }
  pop.style.top = `${place.top}px`;
  if (place.align === 'left') {
    pop.style.left = `${place.left}px`;
    pop.style.right = 'auto';
  } else {
    pop.style.left = 'auto';
    pop.style.right = `${place.right}px`;
  }
}

export function positionAnchoredPopover(pop: HTMLElement, btn: HTMLElement, opts: AnchoredPopoverOpts = {}): void {
  if (pop.id === 'pop-refs' && (state.refsPopoverDragging || state.refsPopoverCustomPlace)) return;
  const r = btn.getBoundingClientRect();
  const rect = { top: r.top, left: r.left, right: r.right, bottom: r.bottom };
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const fixed = pop.id === 'pop-refs' ? { width: state.refsPopoverWidth, height: state.refsPopoverHeight } : undefined;
  applyAnchoredPopoverPlacement(pop, anchoredPopoverPlacement(rect, pop.offsetHeight, viewport, opts), fixed);
  applyAnchoredPopoverPlacement(pop, anchoredPopoverPlacement(rect, pop.offsetHeight, viewport, opts), fixed);
}

export function refsPopoverEdgeAxis(edge: PopoverEdge): { horizontal: boolean; vertical: boolean } {
  return {
    horizontal: edge.includes('e') || edge.includes('w'),
    vertical: edge.includes('n') || edge.includes('s'),
  };
}

export function refsPopoverCursor(edge: PopoverEdge): string {
  if (edge === 'n' || edge === 's') return 'ns-resize';
  if (edge === 'e' || edge === 'w') return 'ew-resize';
  if (edge === 'ne' || edge === 'sw') return 'nesw-resize';
  return 'nwse-resize';
}

export function setRefsResizeCursor(cursor: string | null): void {
  const root = document.documentElement;
  if (!cursor) {
    root.classList.remove('refs-pop-resize');
    root.style.removeProperty('--refs-pop-resize');
    return;
  }
  root.style.setProperty('--refs-pop-resize', cursor);
  root.classList.add('refs-pop-resize');
}

export function applyDraggedRefsPopover(pop: HTMLElement, next: PopoverRect, edge: PopoverEdge): void {
  const axis = refsPopoverEdgeAxis(edge);
  pop.style.position = 'fixed';
  pop.style.margin = '0';
  pop.style.right = 'auto';
  pop.style.bottom = 'auto';
  pop.style.left = `${next.left}px`;
  pop.style.top = `${next.top}px`;
  if (axis.horizontal) lockPopoverWidth(pop, next.width);
  if (axis.vertical) lockPopoverHeight(pop, next.height);
}

export function clampRefsPopoverIntoView(pop: HTMLElement): void {
  const margin = 4;
  const rect = pop.getBoundingClientRect();
  const width = fitPopoverSpan(state.refsPopoverWidth, window.innerWidth - margin * 2, REFS_POPOVER_MIN_WIDTH);
  const height =
    state.refsPopoverHeight == null
      ? rect.height
      : fitPopoverSpan(state.refsPopoverHeight, window.innerHeight - margin * 2, REFS_POPOVER_MIN_HEIGHT);
  let left = rect.right - width;
  let top = rect.top;
  const maxLeft = window.innerWidth - margin - width;
  const maxTop = window.innerHeight - margin - height;
  left = Math.min(Math.max(left, margin), Math.max(margin, maxLeft));
  top = Math.min(Math.max(top, margin), Math.max(margin, maxTop));
  pop.style.position = 'fixed';
  pop.style.margin = '0';
  pop.style.right = 'auto';
  pop.style.bottom = 'auto';
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
  lockPopoverWidth(pop, width);
  if (state.refsPopoverHeight != null) lockPopoverHeight(pop, height);
}

export function bindRefsPopoverResize(): void {
  const pop = $('pop-refs');
  pop.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    const handle = (ev.target as HTMLElement).closest<HTMLElement>('.pop-frame');
    if (!handle || !pop.contains(handle)) return;
    const edge = handle.dataset.edge;
    if (!isPopoverEdge(edge)) return;
    ev.preventDefault();
    ev.stopPropagation();
    const rect = pop.getBoundingClientRect();
    const start: PopoverRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    const originX = ev.clientX;
    const originY = ev.clientY;
    const axis = refsPopoverEdgeAxis(edge);
    state.refsPopoverDragging = true;
    state.refsPopoverCustomPlace = true;
    pop.style.left = `${rect.left}px`;
    pop.style.right = 'auto';
    pop.style.top = `${rect.top}px`;
    pop.style.bottom = 'auto';
    setRefsResizeCursor(refsPopoverCursor(edge));
    handle.setPointerCapture(ev.pointerId);
    const move = (e: PointerEvent) => {
      const next = resizePopoverRect(start, edge, e.clientX - originX, e.clientY - originY, {
        minWidth: REFS_POPOVER_MIN_WIDTH,
        minHeight: REFS_POPOVER_MIN_HEIGHT,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });
      applyDraggedRefsPopover(pop, next, edge);
    };
    const finish = (e: PointerEvent) => {
      if (!state.refsPopoverDragging) return;
      state.refsPopoverDragging = false;
      setRefsResizeCursor(null);
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', finish);
      handle.removeEventListener('pointercancel', finish);
      move(e);
      const box = pop.getBoundingClientRect();
      if (axis.horizontal) {
        state.refsPopoverWidth = Math.round(box.width);
        lockPopoverWidth(pop, state.refsPopoverWidth);
      }
      if (axis.vertical) {
        state.refsPopoverHeight = Math.round(box.height);
        lockPopoverHeight(pop, state.refsPopoverHeight);
      }
      persistView();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
  });
}

export function positionPopover(pop: HTMLElement, x: number, y: number): void {
  pop.style.inset = 'auto';
  pop.style.margin = '0';
  pop.style.position = 'fixed';
  pop.style.left = `${x}px`;
  pop.style.top = `${y}px`;
  const w = pop.offsetWidth;
  const h = pop.offsetHeight;
  pop.style.left = `${Math.max(4, Math.min(x, window.innerWidth - w - 4))}px`;
  pop.style.top = `${Math.max(4, Math.min(y, window.innerHeight - h - 4))}px`;
}

export function placePopover(pop: HTMLElement, x: number, y: number): void {
  positionPopover(pop, x, y);
  pop.showPopover?.();
  positionPopover(pop, x, y);
}

export function bindPopoverAnchor(btnId: string, popId: string, opts: AnchoredPopoverOpts = {}): void {
  const btn = $(btnId);
  const pop = $(popId);
  pop.addEventListener('beforetoggle', (ev) => {
    if ((ev as ToggleEvent).newState !== 'open') return;
    positionAnchoredPopover(pop, btn, opts);
  });
  pop.addEventListener('toggle', () => {
    const open = pop.matches(':popover-open');
    btn.setAttribute('aria-pressed', open ? 'true' : 'false');
    if (open) positionAnchoredPopover(pop, btn, opts);
  });
}

export const ANCHOR_POPS: Array<[string, string, AnchoredPopoverOpts?]> = [
  ['btn-refs', 'pop-refs'],
  ['btn-dates', 'pop-dates'],
  ['btn-contributor', 'pop-contributor'],
  ['btn-graph', 'pop-graph'],
  ['btn-settings', 'pop-settings'],
  ['btn-find', 'pop-find'],
  ['btn-date', 'pop-date'],
  ['btn-repo', 'pop-repo', { align: 'left' }],
  ['btn-repo-help', 'pop-repo-help', { align: 'left', maxWidth: 400 }],
  ['btn-undo-menu', 'pop-undo', { align: 'left' }],
  ['btn-redo-menu', 'pop-redo', { align: 'left' }],
];

export function repositionOpenAnchoredPopovers(): void {
  for (const [btnId, popId, opts] of ANCHOR_POPS) {
    const pop = $(popId);
    if (!pop.matches(':popover-open')) continue;
    if (popId === 'pop-refs' && state.refsPopoverDragging) continue;
    if (popId === 'pop-refs' && state.refsPopoverCustomPlace) {
      clampRefsPopoverIntoView(pop);
      continue;
    }
    positionAnchoredPopover(pop, $(btnId), opts);
  }
}

export function openCtx(html: string, x: number, y: number): void {
  const pop = $('pop-ctx');
  pop.innerHTML = html;
  placePopover(pop, x, y);
}
