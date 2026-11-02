import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NO_COMMON_PARENT_NOTE } from '../../shared/compareSplit';
import { UNCOMMITTED } from '../../shared/types';
import { loadDetails } from './details';

const dirs: string[] = [];

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    windowsHide: true,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function write(cwd: string, name: string, text: string): void {
  writeFileSync(join(cwd, name), text);
}

function init(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ggr-cmp-'));
  dirs.push(dir);
  git(dir, ['init', '-b', 'main']);
  git(dir, ['config', 'user.email', 'a@ex']);
  git(dir, ['config', 'user.name', 'A']);
  write(dir, 'shared.txt', 'base\n');
  write(dir, 'left-only.txt', 'base\n');
  write(dir, 'right-only.txt', 'base\n');
  git(dir, ['add', '.']);
  git(dir, ['commit', '-m', 'base']);
  return dir;
}

/** Two branches that each change `shared.txt` and one file of their own. Left also renames `left-only.txt`. */
function diverge(dir: string): void {
  git(dir, ['checkout', '-b', 'left']);
  write(dir, 'shared.txt', 'left\n');
  write(dir, 'added-left.txt', 'added\n');
  git(dir, ['mv', 'left-only.txt', 'moved.txt']);
  git(dir, ['add', '.']);
  git(dir, ['commit', '-m', 'left']);
  git(dir, ['checkout', '-b', 'right', 'main']);
  write(dir, 'shared.txt', 'right\n');
  write(dir, 'right-only.txt', 'right\n');
  git(dir, ['add', '.']);
  git(dir, ['commit', '-m', 'right']);
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('loadDetails compare', () => {
  it('splits changes since the common parent and keeps the direct diff', async () => {
    const dir = init();
    diverge(dir);
    const details = await loadDetails('git', dir, 'left', 'right');
    expect(details.hash).toBe('left');
    expect(details.compare).toBe('right');
    expect(details.compareNote).toBeUndefined();
    expect(details.compareSplit?.relation).toBe('diverged');
    expect(details.compareSplit?.base).toMatch(/^[0-9a-f]{40}$/);
    expect(details.compareSplit?.leftOnly).toEqual([
      { path: 'added-left.txt', status: 'A', additions: 1, deletions: 0 },
      { path: 'moved.txt', status: 'R', oldPath: 'left-only.txt', additions: 0, deletions: 0 },
    ]);
    expect(details.compareSplit?.rightOnly).toEqual([
      { path: 'right-only.txt', status: 'M', additions: 1, deletions: 1 },
    ]);
    expect(details.compareSplit?.both.map((pair) => pair.key)).toEqual(['shared.txt']);
    expect(details.files.find((file) => file.path === 'added-left.txt')?.status).toBe('D');
  });

  it('treats the ancestor side as empty', async () => {
    const dir = init();
    diverge(dir);
    const details = await loadDetails('git', dir, 'left', 'main');
    expect(details.compareSplit?.relation).toBe('left-contains-right');
    expect(details.compareSplit?.rightOnly).toEqual([]);
    expect(details.compareSplit?.both).toEqual([]);
    expect(details.compareSplit?.leftOnly.map((file) => file.path)).toEqual(['added-left.txt', 'moved.txt', 'shared.txt']);
  });

  it('keeps the snapshot when the histories are unrelated or one side is the worktree', async () => {
    const dir = init();
    diverge(dir);
    git(dir, ['checkout', '--orphan', 'orphan']);
    git(dir, ['rm', '-rf', '.']);
    write(dir, 'other.txt', 'other\n');
    git(dir, ['add', 'other.txt']);
    git(dir, ['commit', '-m', 'orphan']);
    const unrelated = await loadDetails('git', dir, 'left', 'orphan');
    expect(unrelated.compareSplit).toBeUndefined();
    expect(unrelated.compareNote).toBe(NO_COMMON_PARENT_NOTE);
    expect(unrelated.files.length).toBeGreaterThan(0);

    const worktree = await loadDetails('git', dir, UNCOMMITTED, 'left');
    expect(worktree.compareSplit).toBeUndefined();
    expect(worktree.compareNote).toBe(NO_COMMON_PARENT_NOTE);
    expect(worktree.hash).toBe(UNCOMMITTED);
  });

  it('reports two tips that are the same commit', async () => {
    const dir = init();
    const details = await loadDetails('git', dir, 'main', 'main');
    expect(details.compareSplit?.relation).toBe('same');
    expect(details.compareSplit?.leftOnly).toEqual([]);
    expect(details.compareSplit?.rightOnly).toEqual([]);
    expect(details.compareSplit?.both).toEqual([]);
    expect(details.files).toEqual([]);
  });

  it('records every merge base and still picks one', async () => {
    const dir = init();
    git(dir, ['checkout', '-b', 'left']);
    write(dir, 'left-only.txt', 'left\n');
    git(dir, ['commit', '-am', 'left']);
    git(dir, ['checkout', '-b', 'right', 'main']);
    write(dir, 'right-only.txt', 'right\n');
    git(dir, ['commit', '-am', 'right']);
    const leftTip = git(dir, ['rev-parse', 'left']);
    git(dir, ['checkout', 'left']);
    git(dir, ['merge', 'right', '-m', 'merge right']);
    git(dir, ['checkout', 'right']);
    git(dir, ['merge', leftTip, '-m', 'merge left']);
    const details = await loadDetails('git', dir, 'left', 'right');
    expect(details.compareSplit?.bases?.length).toBeGreaterThan(1);
    expect(details.compareSplit?.bases).toContain(details.compareSplit?.base);
  });
});
