import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WorktreeRow } from '../../shared/worktreePorcelain';
import { collectRepos, findRepoRoots, norm } from './scan';

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ggr-scan-'));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function dir(...parts: string[]): string {
  const p = path.join(tmp, ...parts);
  fs.mkdirSync(p, { recursive: true });
  return p;
}

function gitDir(...parts: string[]): string {
  const p = dir(...parts);
  fs.mkdirSync(path.join(p, '.git'));
  return p;
}

function gitFile(...parts: string[]): string {
  const p = dir(...parts);
  fs.writeFileSync(path.join(p, '.git'), 'gitdir: ../main/.git/worktrees/feature\n');
  return p;
}

function tree(p: string): WorktreeRow {
  return { path: p, head: 'abc', branch: 'refs/heads/main', bare: false };
}

describe('findRepoRoots', () => {
  it('opens the workspace folder itself when it is a repository', async () => {
    const root = gitDir('ws');
    expect(await findRepoRoots([root], [], 0)).toEqual([root]);
  });

  it('looks into sub folders only as deep as the search depth', async () => {
    const ws = dir('ws');
    const one = gitDir('ws', 'a');
    const two = gitDir('ws', 'b', 'c');
    expect(await findRepoRoots([ws], [], 0)).toEqual([]);
    expect(await findRepoRoots([ws], [], 1)).toEqual([one]);
    expect((await findRepoRoots([ws], [], 2)).sort()).toEqual([one, two].sort());
  });

  it('finds a linked worktree whose .git is a file', async () => {
    const ws = dir('ws');
    const feature = gitFile('ws', 'feature');
    expect(await findRepoRoots([ws], [], 1)).toEqual([feature]);
  });

  it('does not look inside a repository, node_modules, or .git', async () => {
    const ws = dir('ws');
    const outer = gitDir('ws', 'outer');
    gitDir('ws', 'outer', 'inner');
    gitDir('ws', 'node_modules', 'pkg');
    expect(await findRepoRoots([ws], [], 3)).toEqual([outer]);
  });

  it('adds extra folders that exist, even without .git, and skips missing ones', async () => {
    const plain = dir('plain');
    const missing = path.join(tmp, 'missing');
    expect(await findRepoRoots([], [plain, missing], 0)).toEqual([plain]);
  });

  it('skips a workspace folder that cannot be read', async () => {
    expect(await findRepoRoots([path.join(tmp, 'gone')], [], 2)).toEqual([]);
  });
});

describe('collectRepos', () => {
  const main = '/ws/main';
  const feature = '/ws/feature';

  it('lists every worktree of a root once', async () => {
    const repos = await collectRepos([main, feature], [], ['/ws'], async () => [tree(main), tree(feature)]);
    expect(repos.map((r) => r.path)).toEqual([norm(main), norm(feature)]);
    expect(repos.map((r) => r.name)).toEqual(['main', 'feature']);
  });

  it('leaves out hidden roots and hidden worktrees', async () => {
    const calls: string[] = [];
    const repos = await collectRepos([main, feature], [feature], ['/ws'], async (root) => {
      calls.push(root);
      return [tree(main), tree(feature)];
    });
    expect(repos.map((r) => r.path)).toEqual([norm(main)]);
    expect(calls).toEqual([main]);
  });

  it('keeps the root when Git lists no worktrees or fails', async () => {
    expect((await collectRepos([main], [], [], async () => [])).map((r) => r.path)).toEqual([norm(main)]);
    const failed = await collectRepos([main], [], [], async () => {
      throw new Error('not a git repository');
    });
    expect(failed.map((r) => r.path)).toEqual([norm(main)]);
  });

  it('matches a hidden path written with a trailing separator', async () => {
    const repos = await collectRepos([main], [`${path.resolve(main)}${path.sep}`], [], async () => [tree(main)]);
    expect(repos).toEqual([]);
  });
});
