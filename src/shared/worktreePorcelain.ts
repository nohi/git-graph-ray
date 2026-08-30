export type WorktreeRow = {
  path: string;
  head: string;
  branch: string | null;
  bare: boolean;
};

export function parseWorktreePorcelain(stdout: string): WorktreeRow[] {
  const rows: WorktreeRow[] = [];
  let current: Partial<WorktreeRow> = {};
  for (const line of stdout.split(/\r?\n/)) {
    if (line === '') {
      if (current.path) {
        rows.push({
          path: current.path,
          head: current.head ?? '',
          branch: current.branch ?? null,
          bare: Boolean(current.bare),
        });
      }
      current = {};
      continue;
    }
    if (line.startsWith('worktree ')) current.path = line.slice(9);
    else if (line.startsWith('HEAD ')) current.head = line.slice(5);
    else if (line.startsWith('branch ')) current.branch = line.slice(7).replace(/^refs\/heads\//, '');
    else if (line === 'bare') current.bare = true;
    else if (line === 'detached') current.branch = null;
  }
  if (current.path) {
    rows.push({
      path: current.path,
      head: current.head ?? '',
      branch: current.branch ?? null,
      bare: Boolean(current.bare),
    });
  }
  return rows;
}
