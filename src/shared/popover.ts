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
