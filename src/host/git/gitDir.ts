import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { gitExec } from './runner';

export interface GitWatchDirs {
  /** Per-worktree git dir (HEAD, index). `<repo>/.git` in the main worktree. */
  gitDir: string;
  /** Shared git dir (refs, packed-refs). The same as `gitDir` in the main worktree. */
  commonDir: string;
}

export interface GitWatchTarget {
  root: string;
  glob: string;
}

/** `gitdir: <path>` from a linked worktree's `.git` file, resolved against the worktree folder. */
export function parseGitDirFile(content: string, worktreePath: string): string | undefined {
  const target = content.match(/^\s*gitdir:\s*(.+?)\s*$/im)?.[1];
  return target ? path.resolve(worktreePath, target) : undefined;
}

/** `commondir` file inside a linked worktree's git dir, resolved against that git dir. */
export function parseCommonDirFile(content: string, gitDir: string): string | undefined {
  const target = content.split(/\r?\n/)[0]?.trim();
  return target ? path.resolve(gitDir, target) : undefined;
}

/** Output of `git rev-parse --absolute-git-dir --git-common-dir`, run in `cwd`. */
export function parseGitWatchDirs(stdout: string, cwd: string): GitWatchDirs | undefined {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines[0]) return undefined;
  const gitDir = path.resolve(cwd, lines[0]);
  const commonDir = lines[1] ? path.resolve(cwd, lines[1]) : gitDir;
  return { gitDir, commonDir };
}

/**
 * Watch roots. The main worktree watches its whole `.git` folder.
 * A linked worktree watches its own git dir plus refs in the common dir,
 * so another worktree's index writes do not reload this graph.
 */
export function gitWatchTargets(dirs: GitWatchDirs): GitWatchTarget[] {
  if (sameGitPath(dirs.gitDir, dirs.commonDir)) return [{ root: dirs.gitDir, glob: '**' }];
  return [
    { root: dirs.gitDir, glob: '**' },
    { root: dirs.commonDir, glob: '{packed-refs,refs/**}' },
  ];
}

/**
 * Path of `fsPath` inside the deepest root that contains it, with `/` separators.
 * Drive letter and case differences are ignored.
 */
export function relativeToGitRoot(fsPath: string, roots: readonly string[]): string | undefined {
  const file = slash(fsPath);
  const fileKey = file.toLowerCase();
  let best: string | undefined;
  let bestLen = -1;
  for (const root of roots) {
    const r = slash(root).replace(/\/+$/, '');
    if (!r || r.length <= bestLen) continue;
    if (!fileKey.startsWith(`${r.toLowerCase()}/`)) continue;
    best = file.slice(r.length + 1);
    bestLen = r.length;
  }
  return best || undefined;
}

/** Git dirs for `repoPath`. Falls back to reading `.git` when git cannot answer. */
export async function resolveGitWatchDirs(git: string, repoPath: string): Promise<GitWatchDirs> {
  try {
    const r = await gitExec(git, repoPath, ['rev-parse', '--absolute-git-dir', '--git-common-dir']);
    if (r.code === 0) {
      const dirs = parseGitWatchDirs(r.stdout.toString('utf8'), repoPath);
      if (dirs) return dirs;
    }
  } catch {
    /* git could not start; read .git below */
  }
  return readGitWatchDirs(repoPath);
}

async function readGitWatchDirs(repoPath: string): Promise<GitWatchDirs> {
  const dotGit = path.join(repoPath, '.git');
  try {
    if ((await fs.stat(dotGit)).isFile()) {
      const gitDir = parseGitDirFile(await fs.readFile(dotGit, 'utf8'), repoPath);
      if (gitDir) {
        const commonDir = await fs
          .readFile(path.join(gitDir, 'commondir'), 'utf8')
          .then((text) => parseCommonDirFile(text, gitDir))
          .catch(() => undefined);
        return { gitDir, commonDir: commonDir ?? gitDir };
      }
    }
  } catch {
    /* no .git; keep the old default */
  }
  return { gitDir: dotGit, commonDir: dotGit };
}

function slash(p: string): string {
  return p.replace(/\\/g, '/');
}

function sameGitPath(a: string, b: string): boolean {
  return slash(a).replace(/\/+$/, '').toLowerCase() === slash(b).replace(/\/+$/, '').toLowerCase();
}
