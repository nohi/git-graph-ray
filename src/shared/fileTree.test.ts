import { describe, expect, it } from 'vitest';
import { buildFileTree, FOLDER_MENU, folderFoldPlan, wantsNestedFolderToggle } from './fileTree';

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
  it('offers fold actions, then copy and open', () => {
    expect(FOLDER_MENU.map((item) => item.label)).toEqual([
      'Expand',
      'Collapse',
      'Collapse child folders',
      'Copy Path',
      'Copy Full Path',
      'Open folder',
    ]);
    expect(FOLDER_MENU.map((item) => item.action ?? item.command)).toEqual([
      'expand',
      'collapse',
      'collapse-children',
      'copy-path',
      'copy-full-path',
      'open-folder',
    ]);
  });
});

describe('buildFileTree', () => {
  const files = [
    { path: 'src/host/a.ts', status: 'M', additions: 3, deletions: 1 },
    { path: 'src/host/b.ts', status: 'A', additions: 10, deletions: 0 },
    { path: 'README.md', status: 'D', additions: 0, deletions: 4 },
  ];

  it('keeps each folder path and file line counts', () => {
    const [src, readme] = buildFileTree(files, false);
    expect(readme).toMatchObject({ name: 'README.md', path: 'README.md', additions: 0, deletions: 4 });
    expect(src).toMatchObject({ name: 'src', path: 'src' });
    const host = src?.children?.[0];
    expect(host).toMatchObject({ name: 'host', path: 'src/host' });
    expect(host?.children?.map((file) => ({ path: file.path, additions: file.additions, deletions: file.deletions }))).toEqual([
      { path: 'src/host/a.ts', additions: 3, deletions: 1 },
      { path: 'src/host/b.ts', additions: 10, deletions: 0 },
    ]);
  });

  it('compacts a single nested folder and keeps the deepest path', () => {
    const tree = buildFileTree(files, true);
    const folder = tree.find((node) => node.children);
    expect(folder).toMatchObject({ name: 'src/host', path: 'src/host' });
    expect(folder?.children?.map((file) => file.name)).toEqual(['a.ts', 'b.ts']);
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
