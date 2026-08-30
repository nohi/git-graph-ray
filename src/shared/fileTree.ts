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
