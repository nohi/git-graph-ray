import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listWorktrees, loadWorktreeDirt } from './worktree';
import { gitMaybe } from './runner';

describe('loadWorktreeDirt', () => {
  it('reports only worktrees with uncommitted changes', async () => {
    const outputs: Record<string, string> = {
      '/wt-clean': '',
      '/wt-dirty': ' M a.txt\n',
      '/wt-untracked': '?? new.txt\n',
    };
    const run = async (cwd: string) => outputs[cwd] ?? '';
    expect(await loadWorktreeDirt(['/wt-clean', '/wt-dirty', '/wt-untracked', '', '/wt-dirty'], run, { includeUntracked: true })).toEqual([
      '/wt-dirty',
      '/wt-untracked',
    ]);
    expect(await loadWorktreeDirt(['/wt-clean', '/wt-dirty', '/wt-untracked'], run, { includeUntracked: false })).toEqual(['/wt-dirty']);
  });

  it('leaves out worktrees that fail to read', async () => {
    const run = async (cwd: string) => {
      if (cwd === '/wt-gone') throw new Error('gone');
      return ' M a.txt\n';
    };
    expect(await loadWorktreeDirt(['/wt-gone', '/wt-dirty'], run, { includeUntracked: true })).toEqual(['/wt-dirty']);
  });

  it('limits how many status reads run at once', async () => {
    let live = 0;
    let peak = 0;
    const run = async (cwd: string) => {
      live += 1;
      peak = Math.max(peak, live);
      await new Promise((resolve) => setTimeout(resolve, 5));
      live -= 1;
      return cwd === '/wt-dirty' ? ' M a.txt\n' : '';
    };
    const paths = ['/wt-dirty', '/w2', '/w3', '/w4', '/w5', '/w6'];
    expect(await loadWorktreeDirt(paths, run, { includeUntracked: true, limit: 2 })).toEqual(['/wt-dirty']);
    expect(peak).toBeLessThanOrEqual(2);
  });
});

describe('loadWorktreeDirt against real worktrees', () => {
  let root = '';
  let repo = '';
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ggr-wt-'));
    repo = path.join(root, 'repo');
    fs.mkdirSync(repo);
    git('init', '-q', '-b', 'main');
    git('config', 'user.name', 'Test');
    git('config', 'user.email', 'test@example.com');
    git('config', 'commit.gpgsign', 'false');
    git('config', 'core.autocrlf', 'false');
    fs.writeFileSync(path.join(repo, 'a.txt'), 'one\n');
    git('add', 'a.txt');
    git('commit', '-q', '-m', 'first');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('marks only the worktree with uncommitted changes', async () => {
    const clean = path.join(root, 'wt-clean');
    const dirty = path.join(root, 'wt-dirty');
    git('worktree', 'add', '--detach', clean);
    git('worktree', 'add', '--detach', dirty);
    fs.writeFileSync(path.join(dirty, 'a.txt'), 'one\ntwo\n');
    const rows = await listWorktrees('git', repo);
    const run = (cwd: string) => gitMaybe('git', cwd, ['status', '--porcelain=v1', '-b', '-unormal']);
    const dirtyPaths = await loadWorktreeDirt(
      rows.map((row) => row.path),
      run,
      { includeUntracked: true },
    );
    expect(dirtyPaths.map((p) => path.normalize(p))).toEqual([dirty]);
  });
});
