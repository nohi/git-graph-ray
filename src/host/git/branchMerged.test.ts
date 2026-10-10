import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { branchFullyMerged } from './branchMerged';

const dirs: string[] = [];

function git(cwd: string, args: string[]): void {
  execFileSync('git', args, { cwd, windowsHide: true, stdio: 'ignore' });
}

function init(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ggr-merged-'));
  dirs.push(dir);
  git(dir, ['init', '-b', 'main']);
  git(dir, ['config', 'user.email', 'a@ex']);
  git(dir, ['config', 'user.name', 'A']);
  git(dir, ['commit', '--allow-empty', '-m', 'base']);
  return dir;
}

function branchDeleteFails(cwd: string, name: string): boolean {
  try {
    execFileSync('git', ['branch', '-d', name], { cwd, windowsHide: true, stdio: 'ignore' });
    return false;
  } catch {
    return true;
  }
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('branchFullyMerged', () => {
  it('treats a branch at HEAD as merged', async () => {
    const dir = init();
    git(dir, ['branch', 'topic']);
    expect(await branchFullyMerged('git', dir, 'topic')).toBe(true);
    expect(branchDeleteFails(dir, 'topic')).toBe(false);
  });

  it('treats a branch with unique commits as unmerged', async () => {
    const dir = init();
    git(dir, ['checkout', '-b', 'feature']);
    git(dir, ['commit', '--allow-empty', '-m', 'feature']);
    git(dir, ['checkout', 'main']);
    expect(await branchFullyMerged('git', dir, 'feature')).toBe(false);
    expect(branchDeleteFails(dir, 'feature')).toBe(true);
  });

  it('follows the upstream when that disagrees with HEAD', async () => {
    const dir = init();
    git(dir, ['checkout', '-b', 'feature']);
    git(dir, ['commit', '--allow-empty', '-m', 'feature']);
    git(dir, ['branch', 'upstream']);
    git(dir, ['checkout', '-b', 'other', 'main']);
    git(dir, ['commit', '--allow-empty', '-m', 'other']);
    git(dir, ['branch', '--set-upstream-to', 'upstream', 'feature']);
    expect(await branchFullyMerged('git', dir, 'feature')).toBe(true);
    expect(branchDeleteFails(dir, 'feature')).toBe(false);

    const ahead = init();
    git(ahead, ['checkout', '-b', 'feature']);
    git(ahead, ['commit', '--allow-empty', '-m', 'feature']);
    git(ahead, ['checkout', '-b', 'contains', 'feature']);
    git(ahead, ['branch', '--set-upstream-to', 'main', 'feature']);
    expect(await branchFullyMerged('git', ahead, 'feature')).toBe(false);
    expect(branchDeleteFails(ahead, 'feature')).toBe(true);
  });
});
