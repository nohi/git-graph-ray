import { describe, expect, it } from 'vitest';
import {
  defaultWorktreeLocation,
  primaryWorktreePath,
  suggestedWorktreeFolder,
  worktreeDestination,
  worktreeDialogHtml,
  worktreeFormState,
  worktreeInsideMain,
} from './worktreeDialog';

const main = 'I:/ws/git-graph-ray';

describe('worktree destination', () => {
  it('defaults to a sibling of the main worktree', () => {
    expect(defaultWorktreeLocation(main)).toBe('I:\\ws');
    expect(worktreeDestination('I:\\ws', 'topic', main)).toBe('I:/ws/topic');
    expect(worktreeInsideMain('I:/ws/topic', main)).toBe(false);
  });

  it('resolves a bare folder name beside the main worktree', () => {
    expect(worktreeDestination('', 'topic', main)).toBe('I:/ws/topic');
    expect(worktreeDestination('elsewhere', 'topic', main)).toBe('I:/ws/elsewhere/topic');
  });

  it('warns when the folder is inside the main worktree', () => {
    const state = worktreeFormState('I:\\ws\\git-graph-ray', 'topic', main);
    expect(state.destination).toBe('I:\\ws\\git-graph-ray\\topic');
    expect(state.insideMain).toBe(true);
    expect(state.warning).toContain('I:\\ws\\git-graph-ray');
    expect(state.canCreate).toBe(true);
    expect(worktreeFormState('I:\\ws', 'git-graph-ray', main).insideMain).toBe(true);
  });

  it('places a worktree beside a UNC main worktree', () => {
    expect(defaultWorktreeLocation('//server/share/repo')).toBe('\\\\server\\share');
    expect(worktreeInsideMain('//server/share/repo/nested', '//server/share/repo')).toBe(true);
    expect(worktreeInsideMain('//server/share/repo-other', '//server/share/repo')).toBe(false);
  });

  it('does not treat a longer sibling name as inside', () => {
    expect(worktreeInsideMain('I:/ws/git-graph-ray-other', main)).toBe(false);
    expect(worktreeInsideMain('I:/ws/git-graph-ray/other', main)).toBe(true);
  });

  it('matches Windows paths case-insensitively and keeps Unix paths sensitive', () => {
    expect(worktreeInsideMain('i:\\WS\\Git-Graph-Ray\\a', main)).toBe(true);
    expect(worktreeInsideMain('/WS/Repo/a', '/ws/repo')).toBe(false);
    expect(worktreeInsideMain('/ws/repo/a', '/ws/repo')).toBe(true);
  });

  it('lets .. climb out of the main worktree', () => {
    expect(worktreeDestination('I:/ws/git-graph-ray', '../topic', main)).toBe('I:/ws/topic');
    expect(worktreeInsideMain(worktreeDestination(main, '../topic', main), main)).toBe(false);
  });

  it('accepts an absolute folder name as the full destination', () => {
    expect(worktreeDestination('I:/ws', 'D:/trees/topic', main)).toBe('D:/trees/topic');
  });

  it('uses the main worktree, not a later linked worktree', () => {
    expect(
      primaryWorktreePath(
        [
          { path: 'I:/ws/git-graph-ray', bare: false },
          { path: 'I:/ws/git-graph-ray-topic', bare: false },
        ],
        'I:/other',
      ),
    ).toBe('I:/ws/git-graph-ray');
    expect(primaryWorktreePath([{ path: '/bare', bare: true }, { path: '/link', bare: false }], '/fallback')).toBe('/link');
    expect(primaryWorktreePath([], '/fallback')).toBe('/fallback');
  });
});

describe('worktree dialog', () => {
  it('suggests the current branch, otherwise a short hash', () => {
    expect(
      suggestedWorktreeFolder(
        [
          { kind: 'head', name: 'other' },
          { kind: 'head', name: 'cur' },
        ],
        'abcdef1234567',
        'cur',
      ),
    ).toBe('cur');
    expect(suggestedWorktreeFolder([{ kind: 'head', name: 'HEAD' }], 'abcdef1234567', null)).toBe('wt-abcdef1');
    expect(suggestedWorktreeFolder([{ kind: 'head', name: 'a:b' }], 'abc', null)).toBe('a-b');
    expect(suggestedWorktreeFolder([{ kind: 'head', name: 'feature/login' }], 'abc', null)).toBe('feature-login');
  });

  it('asks for a location and a folder name', () => {
    const html = worktreeDialogHtml({ location: 'I:\\ws', name: 'topic', requestId: 'p1' });
    expect(html).toContain('id="wt-loc"');
    expect(html).toContain('value="I:\\ws"');
    expect(html).toContain('id="wt-name"');
    expect(html).toContain('value="topic"');
    expect(html).toContain('id="wt-browse"');
    expect(html).toContain('id="wt-warn"');
    expect(html).toContain('hidden');
  });

  it('escapes location text', () => {
    const html = worktreeDialogHtml({ location: 'a"b<c', name: 'n', requestId: 'r' });
    expect(html).toContain('value="a&quot;b&lt;c"');
  });

  it('requires a folder name before create', () => {
    expect(worktreeFormState('I:\\ws', '', main).canCreate).toBe(false);
    expect(worktreeFormState('I:\\ws', 'topic', main).canCreate).toBe(true);
    expect(worktreeFormState('I:\\ws', 'topic', main).destination).toBe('I:\\ws\\topic');
  });
});
