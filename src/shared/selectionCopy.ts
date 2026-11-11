import { t } from '@vscode/l10n';
import type { MenuItem } from './commitMenu';

/** Context menu for a text selection in the commit details panel. */
export function copySelectionItem(text: string): MenuItem {
  if (text.length > 0) return { id: 'copy-sel', label: t('Copy') };
  return { id: 'copy-sel', label: t('Copy'), disabled: true, title: t('Select text to copy') };
}
