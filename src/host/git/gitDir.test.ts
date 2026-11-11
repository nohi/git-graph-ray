import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { gitWatchTargets, parseCommonDirFile, parseGitDirFile, parseGitWatchDirs, relativeToGitRoot } from './gitDir';

describe('parseGitDirFile', () => {
  it('reads an absolute gitdir line', () => {
    expect(parseGitDirFile('gitdir: /repo/.git/worktrees/feature\n', '/repo-feature')).toBe(
      path.resolve('/repo/.git/worktrees/feature'),
    );
  });

  it('resolves a relative gitdir against the worktree folder', () => {
    expect(parseGitDirFile('gitdir: ../repo/.git/worktrees/feature\r\n', '/work/repo-feature')).toBe(
      path.resolve('/work/repo-feature', '../repo/.git/worktrees/feature'),
    );
  });

  it('ignores files without a gitdir line', () => {
    expect(parseGitDirFile('', '/repo')).toBeUndefined();
    expect(parseGitDirFile('ref: refs/heads/main\n', '/repo')).toBeUndefined();
  });
});

describe('parseCommonDirFile', () => {
  it('resolves the common dir against the worktree git dir', () => {
    expect(parseCommonDirFile('../..\n', '/repo/.git/worktrees/feature')).toBe(path.resolve('/repo/.git'));
    expect(parseCommonDirFile('', '/repo/.git/worktrees/feature')).toBeUndefined();
  });
});

describe('parseGitWatchDirs', () => {
  it('reads the git dir and common dir of a linked worktree', () => {
    const out = 'I:/ws/repo/.git/worktrees/feature\nI:/ws/repo/.git\n';
    expect(parseGitWatchDirs(out, 'I:/ws/repo-feature')).toEqual({
      gitDir: path.resolve('I:/ws/repo-feature', 'I:/ws/repo/.git/worktrees/feature'),
      commonDir: path.resolve('I:/ws/repo-feature', 'I:/ws/repo/.git'),
    });
  });

  it('resolves a relative common dir against the repository folder', () => {
    expect(parseGitWatchDirs('/repo/.git\r\n.git\r\n', '/repo')).toEqual({
      gitDir: path.resolve('/repo/.git'),
      commonDir: path.resolve('/repo', '.git'),
    });
  });

  it('uses the git dir as the common dir when the second line is missing', () => {
    expect(parseGitWatchDirs('/repo/.git\n', '/repo')).toEqual({
      gitDir: path.resolve('/repo/.git'),
      commonDir: path.resolve('/repo/.git'),
    });
    expect(parseGitWatchDirs('\n', '/repo')).toBeUndefined();
  });
});

describe('gitWatchTargets', () => {
  it('watches the whole .git folder of the main worktree', () => {
    expect(gitWatchTargets({ gitDir: 'I:\\repo\\.git', commonDir: 'i:/repo/.git/' })).toEqual([
      { root: 'I:\\repo\\.git', glob: '**' },
    ]);
  });

  it('watches the worktree git dir and shared refs of a linked worktree', () => {
    expect(gitWatchTargets({ gitDir: '/repo/.git/worktrees/feature', commonDir: '/repo/.git' })).toEqual([
      { root: '/repo/.git/worktrees/feature', glob: '**' },
      { root: '/repo/.git', glob: '{packed-refs,refs/**}' },
    ]);
  });
});

describe('relativeToGitRoot', () => {
  const roots = ['I:\\ws\\repo\\.git\\worktrees\\feature', 'I:\\ws\\repo\\.git'];

  it('uses the deepest root that contains the path', () => {
    expect(relativeToGitRoot('I:\\ws\\repo\\.git\\worktrees\\feature\\HEAD', roots)).toBe('HEAD');
    expect(relativeToGitRoot('I:\\ws\\repo\\.git\\refs\\heads\\main', roots)).toBe('refs/heads/main');
  });

  it('ignores drive letter case and separators', () => {
    expect(relativeToGitRoot('i:/ws/repo/.git/worktrees/feature/index', roots)).toBe('index');
  });

  it('returns undefined outside every root', () => {
    expect(relativeToGitRoot('I:\\ws\\repo-feature\\src\\app.ts', roots)).toBeUndefined();
    expect(relativeToGitRoot('I:\\ws\\repo\\.gitignore', roots)).toBeUndefined();
    expect(relativeToGitRoot('I:\\ws\\repo\\.git', roots)).toBeUndefined();
  });
});
