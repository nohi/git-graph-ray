/** Left commit-details pane. */
export const DETAILS_META_MIN = 470;
/** Right commit-details pane. */
export const DETAILS_FILES_MIN = 300;
/** Combined width of the two panes at which the default sash is centered. */
export const DETAILS_CENTER_AT = DETAILS_META_MIN * 2;
/** Fallback left width before the pane has been measured. */
export const DETAILS_META_DEFAULT = DETAILS_META_MIN;

/** Left-panel width after a double-click. Never below the left minimum, never wider than the screen. */
export function fittedDetailsMeta(contentWidth: number, screenWidth: number): number {
  const cap = Math.max(DETAILS_META_MIN, screenWidth);
  return Math.round(Math.max(DETAILS_META_MIN, Math.min(Math.ceil(contentWidth), cap)));
}

/** Left-panel width while dragging. The left stays at least 470px and the right at least 300px. */
export function draggedDetailsMeta(proposed: number, detailsWidth: number, sash: number): number {
  const max = Math.max(DETAILS_META_MIN, detailsWidth - sash - DETAILS_FILES_MIN);
  return Math.round(Math.max(DETAILS_META_MIN, Math.min(max, proposed)));
}

/**
 * Default left width from the combined width of the two panes, sash excluded.
 * Once both panes together are at least twice the left minimum, the sash sits in the middle.
 * Below that the left stays at its minimum.
 */
export function defaultDetailsMeta(panelsWidth: number): number {
  const half = panelsWidth / 2;
  const max = Math.max(DETAILS_META_MIN, panelsWidth - DETAILS_FILES_MIN);
  return Math.max(DETAILS_META_MIN, Math.min(half, max));
}
