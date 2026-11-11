import { workingTreeDirty } from './log';
import { gitOk } from './runner';
import { parseWorktreePorcelain, type WorktreeRow } from '../../shared/worktreePorcelain';

export async function listWorktrees(git: string, cwd: string): Promise<WorktreeRow[]> {
  const stdout = await gitOk(git, cwd, ['worktree', 'list', '--porcelain']);
  return parseWorktreePorcelain(stdout);
}

/**
 * Worktree paths with uncommitted changes. At most `limit` status reads run
 * at once, and a worktree that fails to read is left out.
 */
export async function loadWorktreeDirt(
  paths: readonly string[],
  run: (cwd: string) => Promise<string>,
  opts: { includeUntracked: boolean; limit?: number },
): Promise<string[]> {
  const limit = Math.max(1, opts.limit ?? 4);
  const dirty: string[] = [];
  const queue = [...new Set(paths.filter(Boolean))];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const cwd = queue.shift()!;
      let porcelain = '';
      try {
        porcelain = await run(cwd);
      } catch {
        continue;
      }
      if (workingTreeDirty(porcelain, opts.includeUntracked)) dirty.push(cwd);
    }
  });
  await Promise.all(workers);
  return dirty;
}

export async function addWorktree(git: string, cwd: string, path: string, hash: string, branch?: string): Promise<void> {
  const args = ['worktree', 'add'];
  if (branch) args.push('-b', branch);
  args.push(path, hash);
  await gitOk(git, cwd, args);
}

export async function removeWorktree(git: string, cwd: string, path: string, force: boolean): Promise<void> {
  const args = ['worktree', 'remove'];
  if (force) args.push('--force');
  args.push(path);
  await gitOk(git, cwd, args);
}
