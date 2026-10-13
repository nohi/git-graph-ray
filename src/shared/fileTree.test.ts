import { describe, expect, it } from 'vitest';
import { FOLDER_MENU, folderFoldPlan, wantsNestedFolderToggle } from './fileTree';

describe('folderFoldPlan', () => {
  it('opens the folder and every nested folder', () => {
    expect(folderFoldPlan(false, 'expand')).toEqual({ self: true, descendants: true });
    expect(folderFoldPlan(true, 'expand')).toEqual({ self: true, descendants: true });
  });

  it('closes the folder and every nested folder', () => {
    expect(folderFoldPlan(true, 'collapse')).toEqual({ self: false, descendants: false });
    expect(folderFoldPlan(false, 'collapse')).toEqual({ self: false, descendants: false });
  });

  it('keeps the folder open and closes nested folders', () => {
    expect(folderFoldPlan(true, 'collapse-children')).toEqual({ self: true, descendants: false });
    expect(folderFoldPlan(false, 'collapse-children')).toEqual({ self: true, descendants: false });
  });

  it('toggles the folder and sets nested folders to the same state', () => {
    expect(folderFoldPlan(false, 'toggle-nested')).toEqual({ self: true, descendants: true });
    expect(folderFoldPlan(true, 'toggle-nested')).toEqual({ self: false, descendants: false });
  });
});

describe('FOLDER_MENU', () => {
  it('offers expand, collapse, and collapse child folders', () => {
    expect(FOLDER_MENU.map((item) => item.label)).toEqual(['Expand', 'Collapse', 'Collapse child folders']);
    expect(FOLDER_MENU.map((item) => item.action)).toEqual(['expand', 'collapse', 'collapse-children']);
  });
});

describe('wantsNestedFolderToggle', () => {
  const click = { button: 0, altKey: false, shiftKey: false, ctrlKey: false, metaKey: false };

  it('uses Ctrl or Cmd on Windows and Linux', () => {
    expect(wantsNestedFolderToggle({ ...click, ctrlKey: true }, false)).toBe(true);
    expect(wantsNestedFolderToggle({ ...click, metaKey: true }, false)).toBe(true);
    expect(wantsNestedFolderToggle(click, false)).toBe(false);
  });

  it('uses Cmd on macOS and leaves Ctrl+click for the context menu', () => {
    expect(wantsNestedFolderToggle({ ...click, metaKey: true }, true)).toBe(true);
    expect(wantsNestedFolderToggle({ ...click, ctrlKey: true }, true)).toBe(false);
    expect(wantsNestedFolderToggle({ ...click, ctrlKey: true, metaKey: true }, true)).toBe(false);
  });

  it('ignores modified and non-primary clicks', () => {
    expect(wantsNestedFolderToggle({ ...click, ctrlKey: true, shiftKey: true }, false)).toBe(false);
    expect(wantsNestedFolderToggle({ ...click, ctrlKey: true, altKey: true }, false)).toBe(false);
    expect(wantsNestedFolderToggle({ ...click, ctrlKey: true, button: 2 }, false)).toBe(false);
  });
});
