export const REFS_POPOVER_DEFAULT_WIDTH = 400;
export const REFS_POPOVER_MIN_WIDTH = 280;
export const REFS_POPOVER_MIN_HEIGHT = 220;

export type AnchoredPopoverAlign = 'left' | 'right';

export type AnchoredPopoverPlacement = {
  top: number;
  maxWidth: number;
} & ({ align: 'right'; right: number } | { align: 'left'; left: number });

function capMaxWidth(available: number, maxWidthCap?: number): number {
  return maxWidthCap != null ? Math.min(maxWidthCap, available) : available;
}

export function anchoredPopoverPlacement(
  btn: { top: number; left: number; right: number; bottom: number },
  popHeight: number,
  viewport: { width: number; height: number },
  {
    margin = 4,
    align = 'right',
    maxWidth,
  }: { margin?: number; align?: AnchoredPopoverAlign; maxWidth?: number } = {},
): AnchoredPopoverPlacement {
  let top = btn.bottom + 4;
  if (top + popHeight > viewport.height - margin) {
    top = Math.max(margin, btn.top - popHeight - 4);
  }
  if (align === 'left') {
    const left = Math.max(margin, btn.left);
    return { align, left, top, maxWidth: capMaxWidth(Math.max(160, viewport.width - left - margin), maxWidth) };
  }
  const right = Math.max(margin, viewport.width - btn.right);
  return { align, right, top, maxWidth: capMaxWidth(Math.max(160, btn.right - margin), maxWidth) };
}

/**
 * Keep a dialog beside the pointer.
 * Prefer below-right; flip to the other side of the pointer when that would leave the viewport, then clamp.
 */
export function cursorDialogPlacement(
  cursor: { x: number; y: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  margin = 8,
): { left: number; top: number } {
  const gap = 8;
  return {
    left: Math.round(placeBeside(cursor.x, size.width, viewport.width, margin, gap)),
    top: Math.round(placeBeside(cursor.y, size.height, viewport.height, margin, gap)),
  };
}

function placeBeside(cursor: number, size: number, viewport: number, margin: number, gap: number): number {
  const limit = Math.max(margin, viewport - size - margin);
  let start = cursor + gap;
  if (start + size > viewport - margin) start = cursor - gap - size;
  return Math.min(Math.max(start, margin), limit);
}

const POPOVER_EDGES = ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'] as const;
export type PopoverEdge = (typeof POPOVER_EDGES)[number];

export function isPopoverEdge(value: string | null | undefined): value is PopoverEdge {
  return !!value && (POPOVER_EDGES as readonly string[]).includes(value);
}

export type PopoverRect = { left: number; top: number; width: number; height: number };

/** Fit `desired` into `available`, keeping `min` until the space itself is smaller. */
export function fitPopoverSpan(desired: number, available: number, min: number): number {
  const cap = Math.max(0, available);
  const floor = Math.min(min, cap);
  return Math.min(cap, Math.max(floor, desired));
}

/**
 * Resize a popover from one edge or corner.
 * The opposite edge stays put, and the box stops at the viewport margin.
 */
export function resizePopoverRect(
  start: PopoverRect,
  edge: PopoverEdge,
  dx: number,
  dy: number,
  limits: { minWidth: number; minHeight: number; viewportWidth: number; viewportHeight: number; margin?: number },
): PopoverRect {
  const margin = limits.margin ?? 4;
  const west = edge === 'w' || edge === 'nw' || edge === 'sw';
  const east = edge === 'e' || edge === 'ne' || edge === 'se';
  const north = edge === 'n' || edge === 'ne' || edge === 'nw';
  const south = edge === 's' || edge === 'se' || edge === 'sw';

  let left = start.left;
  let top = start.top;
  let width = start.width;
  let height = start.height;

  if (east) {
    width = fitPopoverSpan(start.width + dx, limits.viewportWidth - margin - start.left, limits.minWidth);
  } else if (west) {
    const right = start.left + start.width;
    width = fitPopoverSpan(start.width - dx, right - margin, limits.minWidth);
    left = right - width;
  }

  if (south) {
    height = fitPopoverSpan(start.height + dy, limits.viewportHeight - margin - start.top, limits.minHeight);
  } else if (north) {
    const bottom = start.top + start.height;
    height = fitPopoverSpan(start.height - dy, bottom - margin, limits.minHeight);
    top = bottom - height;
  }

  return { left, top, width, height };
}
