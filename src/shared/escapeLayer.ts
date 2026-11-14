/** Popovers that one Escape closes together, before the selection and the details pane. */
export const ESCAPE_POPOVER_IDS = [
  'pop-graph',
  'pop-settings',
  'pop-ctx',
  'pop-find',
  'pop-date',
  'pop-refs',
  'pop-dates',
  'pop-contributor',
  'pop-repo',
  'pop-repo-help',
  'pop-undo',
  'pop-redo',
  'pop-cols',
] as const;

export type EscapeLayer = 'confirm' | 'popover' | 'selection' | 'details' | 'none';

/**
 * The one layer an Escape closes once no dialog is open:
 * confirm tip, then popovers and menus, then the picked commits, then the details pane.
 */
export function escapeLayer(open: { confirm: boolean; popover: boolean; selection: boolean; details: boolean }): EscapeLayer {
  if (open.confirm) return 'confirm';
  if (open.popover) return 'popover';
  if (open.selection) return 'selection';
  if (open.details) return 'details';
  return 'none';
}
