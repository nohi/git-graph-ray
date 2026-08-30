import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { listWorktrees } from '../git/worktree';
import type { RepoInfo } from '../../shared/types';

export async function discoverRepos(
  git: string,
  extra: string[],
  hidden: string[],
  maxDepth: number,
): Promise<RepoInfo[]> {
  const roots: string[] = [];
  const folders = vscode.workspace.workspaceFolders ?? [];
  for (let i = 0; i < folders.length; i++) {
    const folder = folders[i]!.uri.fsPath;
    await walk(folder, 0, maxDepth, roots);
  }
  for (const p of extra) if (fs.existsSync(path.join(p, '.git')) || fs.existsSync(p)) roots.push(p);

  const hiddenSet = new Set(hidden.map(norm));
  const found = new Map<string, RepoInfo>();
  for (const root of roots) {
    const n = norm(root);
    if (hiddenSet.has(n)) continue;
    try {
      const trees = await listWorktrees(git, root);
      for (const t of trees) {
        const p = norm(t.path);
        if (hiddenSet.has(p) || found.has(p)) continue;
        found.set(p, {
          path: p,
          name: path.basename(p),
          workspaceIndex: folders.findIndex((f) => p.startsWith(norm(f.uri.fsPath))),
        });
      }
      if (!trees.length) {
        found.set(n, { path: n, name: path.basename(n), workspaceIndex: folders.findIndex((f) => n.startsWith(norm(f.uri.fsPath))) });
      }
    } catch {
      found.set(n, { path: n, name: path.basename(n), workspaceIndex: 0 });
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
