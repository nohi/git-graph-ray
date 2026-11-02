import { describe, expect, it } from 'vitest';
import { menuHtml } from './commitMenu';
import { copySelectionItem } from './selectionCopy';

describe('copySelectionItem', () => {
  it('copies the selected text', () => {
    const item = copySelectionItem('fix the graph');
    expect(item).toEqual({ id: 'copy-sel', label: 'Copy' });
    expect(menuHtml([item])).toContain('>Copy</button>');
  });

  it('stays disabled when nothing is selected', () => {
    expect(copySelectionItem('')).toEqual({
      id: 'copy-sel',
      label: 'Copy',
      disabled: true,
      title: 'Select text to copy',
    });
    expect(menuHtml([copySelectionItem('')])).toContain(' disabled');
  });

  it('keeps a whitespace-only selection', () => {
    expect(copySelectionItem('  ')).toEqual({ id: 'copy-sel', label: 'Copy' });
  });
});
