export type FileNode = { name: string; path?: string; status?: string; children?: FileNode[] };

export function buildFileTree(paths: Array<{ path: string; oldPath?: string; status: string }>, compact: boolean): FileNode[] {
  const root: FileNode[] = [];
  for (const file of paths) {
    const parts = file.path.split('/');
    let level = root;
    parts.forEach((part, i) => {
      const last = i === parts.length - 1;
      let node = level.find((n) => n.name === part);
      if (!node) {
        node = last ? { name: part, path: file.path, status: file.status } : { name: part, children: [] };
        level.push(node);
      }
      if (!last) {
        node.children ??= [];
        level = node.children;
      }
    });
  }
  return compact ? compactNodes(root) : root;
}

export type FolderFold = 'expand' | 'collapse' | 'collapse-children' | 'toggle-nested';
export type FolderMenuAction = Exclude<FolderFold, 'toggle-nested'>;
export type FolderFoldPlan = { self: boolean; descendants: boolean };

export const FOLDER_MENU: ReadonlyArray<{ id: string; label: string; action: FolderMenuAction }> = [
  { id: 'fd-expand', label: 'Expand', action: 'expand' },
  { id: 'fd-collapse', label: 'Collapse', action: 'collapse' },
  { id: 'fd-children', label: 'Collapse child folders', action: 'collapse-children' },
];

/**
 * Next open state for a folder and its nested folders.
 * `open` is the folder before the action.
 * Expand and collapse include every nested folder.
 * Collapse-children keeps the folder open and closes nested folders.
 * Toggle-nested flips the folder and sets nested folders to that same state.
 */
export function folderFoldPlan(open: boolean, action: FolderFold): FolderFoldPlan {
  switch (action) {
    case 'expand':
      return { self: true, descendants: true };
    case 'collapse':
      return { self: false, descendants: false };
    case 'collapse-children':
      return { self: true, descendants: false };
    case 'toggle-nested': {
      const next = !open;
      return { self: next, descendants: next };
    }
  }
}

/** Ctrl+click on Windows/Linux, Cmd+click on macOS. Ctrl+click on macOS stays a context-menu click. */
export function wantsNestedFolderToggle(
  ev: { button: number; altKey: boolean; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
  mac: boolean,
): boolean {
  if (ev.button !== 0 || ev.altKey || ev.shiftKey) return false;
  if (mac) return ev.metaKey && !ev.ctrlKey;
  return ev.ctrlKey || ev.metaKey;
}

function compactNodes(nodes: FileNode[]): FileNode[] {
  return nodes.map((n) => {
    let cur = n;
    while (cur.children && cur.children.length === 1 && !cur.children[0]!.path) {
      const only = cur.children[0]!;
      cur = { ...only, name: `${cur.name}/${only.name}` };
    }
    if (cur.children) cur = { ...cur, children: compactNodes(cur.children) };
    return cur;
  });
}
