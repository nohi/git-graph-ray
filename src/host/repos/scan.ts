import * as fs from 'node:fs';
import * as path from 'node:path';
import type { RepoInfo } from '../../shared/types';
import type { WorktreeRow } from '../../shared/worktreePorcelain';
import { workspaceIndexFor } from './openRepo';

/**
 * Folders to open as repositories: each workspace folder searched up to `maxDepth` levels for a `.git` folder or file,
 * then every extra folder that exists, even without `.git`.
 */
export async function findRepoRoots(folders: readonly string[], extra: readonly string[], maxDepth: number): Promise<string[]> {
  const roots: string[] = [];
  for (const folder of folders) await walk(folder, 0, maxDepth, roots);
  for (const p of extra) if (fs.existsSync(path.join(p, '.git')) || fs.existsSync(p)) roots.push(p);
  return roots;
}

/**
 * Repositories for the picker. Each root adds its worktrees, or itself when Git lists none or fails.
 * Hidden paths are left out, and a path found twice is listed once.
 */
export async function collectRepos(
  roots: readonly string[],
  hidden: readonly string[],
  folderPaths: readonly string[],
  listTrees: (root: string) => Promise<WorktreeRow[]>,
): Promise<RepoInfo[]> {
  const hiddenSet = new Set(hidden.map(norm));
  const found = new Map<string, RepoInfo>();
  const info = (p: string): RepoInfo => ({ path: p, name: path.basename(p), workspaceIndex: workspaceIndexFor(p, [...folderPaths]) });
  for (const root of roots) {
    const n = norm(root);
    if (hiddenSet.has(n)) continue;
    try {
      const trees = await listTrees(root);
      for (const t of trees) {
        const p = norm(t.path);
        if (hiddenSet.has(p) || found.has(p)) continue;
        found.set(p, info(p));
      }
      if (!trees.length) found.set(n, info(n));
    } catch {
      found.set(n, info(n));
    }
  }
  return [...found.values()];
}

async function walk(dir: string, depth: number, max: number, out: string[]): Promise<void> {
  if (isGit(dir)) {
    out.push(dir);
    return;
  }
  if (depth >= max) return;
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (!e.isDirectory() || e.name === 'node_modules' || e.name === '.git') continue;
    await walk(path.join(dir, e.name), depth + 1, max, out);
  }
}

function isGit(dir: string): boolean {
  return fs.existsSync(path.join(dir, '.git'));
}

export function norm(p: string): string {
  return path.resolve(p).replaceAll('\\', '/');
}
