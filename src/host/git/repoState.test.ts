import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readRepoOperation } from './repoState';

let repo: string;

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function tryGit(...args: string[]): void {
  try {
    git(...args);
  } catch {
    // A conflict makes Git exit with an error. The test then reads the state it left.
  }
}

function commit(file: string, text: string, message: string): void {
  fs.writeFileSync(path.join(repo, file), text);
  git('add', file);
  git('commit', '-q', '-m', message);
}

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ggr-state-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.com');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.autocrlf', 'false');
  commit('a.txt', 'base\n', 'base');
  git('checkout', '-q', '-b', 'side');
  commit('a.txt', 'side\n', 'side');
  git('checkout', '-q', 'main');
  commit('a.txt', 'main\n', 'main');
});

afterEach(() => {
  fs.rmSync(repo, { recursive: true, force: true });
});

describe('readRepoOperation', () => {
  it('returns null when nothing is in progress', async () => {
    expect(await readRepoOperation('git', repo)).toBeNull();
  });

  it('reports a merge and its conflicted files', async () => {
    tryGit('merge', 'side');
    expect(await readRepoOperation('git', repo)).toEqual({ kind: 'merge', files: ['a.txt'] });
  });

  it('reports a rebase stopped on a conflict', async () => {
    tryGit('rebase', 'side');
    expect(await readRepoOperation('git', repo)).toEqual({ kind: 'rebase', files: ['a.txt'] });
  });

  it('reports a cherry-pick', async () => {
    tryGit('cherry-pick', 'side');
    expect(await readRepoOperation('git', repo)).toEqual({ kind: 'cherry-pick', files: ['a.txt'] });
  });

  it('reports a revert', async () => {
    commit('a.txt', 'later\n', 'later');
    tryGit('revert', '--no-edit', 'HEAD~1');
    expect(await readRepoOperation('git', repo)).toEqual({ kind: 'revert', files: ['a.txt'] });
  });

  it('reports git am before the other operations', async () => {
    const patch = git('format-patch', '-1', '--stdout', 'side');
    const file = path.join(repo, '..', `${path.basename(repo)}.patch`);
    fs.writeFileSync(file, patch);
    try {
      tryGit('am', '-3', file);
      expect(await readRepoOperation('git', repo)).toEqual({ kind: 'am', files: ['a.txt'] });
    } finally {
      fs.rmSync(file, { force: true });
    }
  });

  it('clears once the operation is aborted', async () => {
    tryGit('merge', 'side');
    git('merge', '--abort');
    expect(await readRepoOperation('git', repo)).toBeNull();
  });
});
