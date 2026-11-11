import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({ l10n: { bundle: undefined, t: (s: string) => s }, env: { language: 'en' } }));

import { runGitAction } from './actions';
import { pushTagToRemotes } from './tagPush';

describe('pushTagToRemotes', () => {
  it('pushes each selected remote in order', async () => {
    const pushed: string[] = [];
    await pushTagToRemotes(['origin', 'upstream'], async (remote) => {
      pushed.push(remote);
    });
    expect(pushed).toEqual(['origin', 'upstream']);
  });

  it('stops on the first failed push and leaves later remotes untouched', async () => {
    const seen: string[] = [];
    await expect(
      pushTagToRemotes(['origin', 'upstream'], async (remote) => {
        seen.push(remote);
        throw new Error('rejected');
      }),
    ).rejects.toMatchObject({ pushed: false, message: 'Local tag created. rejected' });
    expect(seen).toEqual(['origin']);
  });

  it('reports remotes that already received the tag and does not continue', async () => {
    const pushed: string[] = [];
    await expect(
      pushTagToRemotes(['origin', 'upstream', 'fork'], async (remote) => {
        if (remote === 'upstream') throw new Error('no access');
        pushed.push(remote);
      }),
    ).rejects.toMatchObject({
      pushed: true,
      message: 'Local tag created and pushed to origin. no access',
    });
    expect(pushed).toEqual(['origin']);
  });
});

let repo: string;

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ggr-actions-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.com');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.autocrlf', 'false');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'one\n');
  git('add', 'a.txt');
  git('commit', '-q', '-m', 'first', '-m', 'body-one');
});

afterEach(() => {
  fs.rmSync(repo, { recursive: true, force: true });
});

describe('amendHead', () => {
  it('rewrites the message and keeps the body', async () => {
    const before = git('rev-parse', 'HEAD');
    await runGitAction(
      'git',
      repo,
      { kind: 'amendHead', hash: before, message: 'first-fixed\n\nbody-two', includeStaged: false },
      { signCommits: false, signTags: false },
    );
    expect(git('rev-parse', 'HEAD')).not.toBe(before);
    expect(git('log', '-1', '--format=%s')).toBe('first-fixed');
    expect(git('log', '-1', '--format=%b').trim()).toBe('body-two');
  });

  it('refuses staged changes left unchecked and leaves HEAD alone', async () => {
    const before = git('rev-parse', 'HEAD');
    fs.writeFileSync(path.join(repo, 'a.txt'), 'one\ntwo\n');
    git('add', 'a.txt');
    await expect(
      runGitAction('git', repo, { kind: 'amendHead', hash: before, message: 'x', includeStaged: false }, { signCommits: false, signTags: false }),
    ).rejects.toThrow('There are staged changes');
    expect(git('rev-parse', 'HEAD')).toBe(before);
  });

  it('takes staged changes into the amended commit when asked', async () => {
    const before = git('rev-parse', 'HEAD');
    fs.writeFileSync(path.join(repo, 'a.txt'), 'one\ntwo\n');
    git('add', 'a.txt');
    await runGitAction(
      'git',
      repo,
      { kind: 'amendHead', hash: before, message: 'with-staged', includeStaged: true },
      { signCommits: false, signTags: false },
    );
    expect(git('log', '-1', '--format=%s')).toBe('with-staged');
    expect(git('show', 'HEAD:a.txt')).toContain('two');
  });

  it('refuses when HEAD moved since the dialog was opened', async () => {
    const stale = git('rev-parse', 'HEAD');
    fs.writeFileSync(path.join(repo, 'b.txt'), 'new\n');
    git('add', 'b.txt');
    git('commit', '-q', '-m', 'second');
    await expect(
      runGitAction('git', repo, { kind: 'amendHead', hash: stale, message: 'x', includeStaged: false }, { signCommits: false, signTags: false }),
    ).rejects.toThrow('HEAD has changed');
  });
});

describe('squashRange', () => {
  it('folds the tip run into one commit on the base', async () => {
    fs.writeFileSync(path.join(repo, 'b.txt'), 'b\n');
    git('add', 'b.txt');
    git('commit', '-q', '-m', 'second');
    fs.writeFileSync(path.join(repo, 'c.txt'), 'c\n');
    git('add', 'c.txt');
    git('commit', '-q', '-m', 'third');
    const tip = git('rev-parse', 'HEAD');
    const mid = git('rev-parse', 'HEAD~1');
    const base = git('rev-parse', 'HEAD~2');
    const tree = git('rev-parse', 'HEAD^{tree}');
    await runGitAction(
      'git',
      repo,
      { kind: 'squashRange', base, hashes: [mid, tip], message: 'squashed' },
      { signCommits: false, signTags: false },
    );
    expect(git('rev-parse', 'HEAD^{tree}')).toBe(tree);
    expect(git('log', '-1', '--format=%s')).toBe('squashed');
    expect(git('rev-parse', 'HEAD~1')).toBe(base);
    expect(git('rev-list', '--count', 'HEAD')).toBe('2');
  });

  it('refuses a stale tip, a wrong base, and staged changes', async () => {
    fs.writeFileSync(path.join(repo, 'b.txt'), 'b\n');
    git('add', 'b.txt');
    git('commit', '-q', '-m', 'second');
    fs.writeFileSync(path.join(repo, 'c.txt'), 'c\n');
    git('add', 'c.txt');
    git('commit', '-q', '-m', 'third');
    const tip = git('rev-parse', 'HEAD');
    const mid = git('rev-parse', 'HEAD~1');
    const base = git('rev-parse', 'HEAD~2');
    const before = git('rev-parse', 'HEAD');
    await expect(
      runGitAction('git', repo, { kind: 'squashRange', base, hashes: [tip, mid], message: 'x' }, { signCommits: false, signTags: false }),
    ).rejects.toThrow('HEAD has changed');
    await expect(
      runGitAction('git', repo, { kind: 'squashRange', base: tip, hashes: [mid, tip], message: 'x' }, { signCommits: false, signTags: false }),
    ).rejects.toThrow('no longer consecutive');
    fs.writeFileSync(path.join(repo, 'a.txt'), 'one\nstaged\n');
    git('add', 'a.txt');
    await expect(
      runGitAction('git', repo, { kind: 'squashRange', base, hashes: [mid, tip], message: 'x' }, { signCommits: false, signTags: false }),
    ).rejects.toThrow('Unstage them before squashing');
    expect(git('rev-parse', 'HEAD')).toBe(before);
  });

  it('refuses a range that reaches the root commit', async () => {
    const tip = git('rev-parse', 'HEAD');
    const root = git('rev-list', '--max-parents=0', 'HEAD').trim();
    const before = git('rev-parse', 'HEAD');
    await expect(
      runGitAction('git', repo, { kind: 'squashRange', base: root, hashes: [root, tip], message: 'x' }, { signCommits: false, signTags: false }),
    ).rejects.toThrow('root commit');
    expect(git('rev-parse', 'HEAD')).toBe(before);
  });
});
