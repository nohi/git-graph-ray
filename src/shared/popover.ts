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
