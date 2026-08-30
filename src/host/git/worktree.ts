import { gitOk } from './runner';
import { parseWorktreePorcelain, type WorktreeRow } from '../../shared/worktreePorcelain';

export async function listWorktrees(git: string, cwd: string): Promise<WorktreeRow[]> {
  const stdout = await gitOk(git, cwd, ['worktree', 'list', '--porcelain']);
  return parseWorktreePorcelain(stdout);
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
