import type { MenuItem } from './commitMenu';

/** Context menu for a text selection in the commit details panel. */
export function copySelectionItem(text: string): MenuItem {
  if (text.length > 0) return { id: 'copy-sel', label: 'Copy' };
  return { id: 'copy-sel', label: 'Copy', disabled: true, title: 'Select text to copy' };
}
