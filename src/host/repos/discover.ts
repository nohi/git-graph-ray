import * as vscode from 'vscode';
import { listWorktrees } from '../git/worktree';
import type { RepoInfo } from '../../shared/types';
import { collectRepos, findRepoRoots, norm } from './scan';

export { norm };

export async function discoverRepos(
  git: string,
  extra: string[],
  hidden: string[],
  maxDepth: number,
): Promise<RepoInfo[]> {
  const folders = (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);
  const roots = await findRepoRoots(folders, extra, maxDepth);
  return collectRepos(roots, hidden, folders.map(norm), (root) => listWorktrees(git, root));
}
