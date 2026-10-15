import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { listRemoteTagTips } from './remoteTags';

const dirs: string[] = [];

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, windowsHide: true, encoding: 'utf8' }).trim();
}

function gitOk(cwd: string, args: string[]): void {
  execFileSync('git', args, { cwd, windowsHide: true, stdio: 'ignore' });
}

function init(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ggr-rtag-'));
  dirs.push(dir);
  gitOk(dir, ['init', '-b', 'main']);
  gitOk(dir, ['config', 'user.email', 'a@ex']);
  gitOk(dir, ['config', 'user.name', 'A']);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('listRemoteTagTips', () => {
  it('reads the commit each remote tag points at and skips a remote that cannot be queried', async () => {
    const origin = init();
    gitOk(origin, ['commit', '--allow-empty', '-m', 'base']);
    const base = git(origin, ['rev-parse', 'HEAD']);
    gitOk(origin, ['tag', 'light']);
    gitOk(origin, ['commit', '--allow-empty', '-m', 'next']);
    const next = git(origin, ['rev-parse', 'HEAD']);
    gitOk(origin, ['-c', 'tag.gpgSign=false', 'tag', '-a', 'ann', '-m', 'note']);

    const local = init();
    gitOk(local, ['remote', 'add', 'origin', origin]);
    const lookup = await listRemoteTagTips('git', local, ['origin', 'missing']);
    expect(lookup.tags).toEqual([
      { remote: 'origin', name: 'ann', commit: next },
      { remote: 'origin', name: 'light', commit: base },
    ]);
    expect(lookup.errors.map((error) => error.remote)).toEqual(['missing']);
    expect(lookup.errors[0]?.message).toMatch(/missing/);
  });
});
