/**
 * Next shown commit for ArrowDown (1) or ArrowUp (-1).
 * `shown` holds commit indexes in display order. `current` is the selected commit index, or -1 when nothing is selected.
 * A selection hidden by a filter moves to the nearest shown commit in that direction.
 */
export function adjacentShownCommit(shown: readonly number[], current: number, dir: 1 | -1): number | undefined {
  if (shown.length === 0) return undefined;
  if (current < 0) return shown[0];
  const pos = shown.indexOf(current);
  if (pos >= 0) return shown[pos + dir];
  return dir > 0 ? shown.find((index) => index > current) : [...shown].reverse().find((index) => index < current);
}

/** Scroll position that brings a row fully into view, or null when it is already visible. */
export function scrollToRevealRow(o: { top: number; rowHeight: number; scrollTop: number; viewHeight: number; pad?: number }): number | null {
  const pad = o.pad ?? 4;
  if (o.top < o.scrollTop + pad) return Math.max(0, o.top - pad);
  const bottom = o.top + o.rowHeight;
  if (bottom > o.scrollTop + o.viewHeight - pad) return Math.max(0, bottom - o.viewHeight + pad);
  return null;
}

/** Enter on the selected commit: open its details, or close them when they are open. */
export function enterOnCommit(selected: string | null, detailsOpen: boolean): 'open' | 'close' | 'none' {
  if (!selected) return 'none';
  return detailsOpen ? 'close' : 'open';
}
