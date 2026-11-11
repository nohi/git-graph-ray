import { describe, expect, it } from 'vitest';
import { ESCAPE_POPOVER_IDS, escapeLayer } from './escapeLayer';

const closed = { confirm: false, popover: false, selection: false, details: false };

describe('escapeLayer', () => {
  it('closes a popover before the details pane', () => {
    expect(escapeLayer({ ...closed, popover: true, details: true })).toBe('popover');
    expect(escapeLayer({ ...closed, popover: true, selection: true, details: true })).toBe('popover');
  });

  it('closes the confirm tip first', () => {
    expect(escapeLayer({ confirm: true, popover: true, selection: true, details: true })).toBe('confirm');
  });

  it('clears the picked commits before the details pane', () => {
    expect(escapeLayer({ ...closed, selection: true, details: true })).toBe('selection');
  });

  it('closes the details pane last, and does nothing when all is closed', () => {
    expect(escapeLayer({ ...closed, details: true })).toBe('details');
    expect(escapeLayer(closed)).toBe('none');
  });
});

describe('ESCAPE_POPOVER_IDS', () => {
  it('includes the undo, redo, and column menus', () => {
    expect(ESCAPE_POPOVER_IDS).toEqual(expect.arrayContaining(['pop-undo', 'pop-redo', 'pop-cols', 'pop-find', 'pop-settings']));
    expect(ESCAPE_POPOVER_IDS).not.toContain('pop-confirm');
  });
});
