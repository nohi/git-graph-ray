import { describe, expect, it } from 'vitest';
import {
  parseRebaseCheckout,
  parseRebaseOnFailure,
  rebaseBranchesDialogHtml,
  rebaseBranchesReportHtml,
  rebaseBranchesSequence,
  rebaseTargetBranches,
  restoreCheckoutArgs,
} from './rebaseBranches';

describe('rebaseTargetBranches', () => {
  it('keeps click order and drops the target and duplicates', () => {
    expect(rebaseTargetBranches(['feature', 'main', 'next', 'feature', ''], 'main')).toEqual(['feature', 'next']);
  });

  it('keeps every selected branch when the target is not a local branch', () => {
    expect(rebaseTargetBranches(['feature', 'main', 'feature'])).toEqual(['feature', 'main']);
  });
});

describe('rebase dialog', () => {
  it('lists the branches and omits interactive', () => {
    const html = rebaseBranchesDialogHtml({ onto: 'main', branches: ['feature', 'next'], ignoreDate: true });
    expect(html).toContain('Rebase onto <code>main</code>');
    expect(html).toContain('<code>feature</code>');
    expect(html).toContain('<code>next</code>');
    expect(html).toContain('ignore date');
    expect(html).toContain('value="restore" checked');
    expect(html).toContain('value="skip" checked');
    expect(html).not.toContain('interactive');
    expect(parseRebaseCheckout('stay')).toBe('stay');
    expect(parseRebaseCheckout(undefined)).toBe('restore');
    expect(parseRebaseOnFailure('stop')).toBe('stop');
    expect(parseRebaseOnFailure(null)).toBe('skip');
  });

  it('reports skips and branches that were not run', () => {
    expect(rebaseBranchesReportHtml([{ branch: 'a', status: 'rebased' }])).toBeNull();
    const html = rebaseBranchesReportHtml([
      { branch: 'a', status: 'rebased' },
      { branch: 'b', status: 'skipped', reason: 'CONFLICT' },
      { branch: 'c', status: 'notRun' },
    ]);
    expect(html).toContain('Rebased');
    expect(html).toContain('a');
    expect(html).toContain('Skipped');
    expect(html).toContain('b — CONFLICT');
    expect(html).toContain('Not run');
    expect(html).toContain('c');
  });
});

describe('restoreCheckoutArgs', () => {
  it('returns to the previous branch, or detaches at the previous commit', () => {
    expect(restoreCheckoutArgs({ branch: 'main', hash: 'abc' })).toEqual(['checkout', 'main']);
    expect(restoreCheckoutArgs({ branch: null, hash: 'abc' })).toEqual(['checkout', '--detach', 'abc']);
    expect(restoreCheckoutArgs({ branch: null, hash: null })).toBeNull();
  });
});

describe('rebaseBranchesSequence', () => {
  it('aborts a conflict and continues when skipping', async () => {
    const aborted: string[] = [];
    let current = '';
    const outcomes = await rebaseBranchesSequence(['a', 'b', 'c'], 'skip', {
      rebase: async (branch) => {
        current = branch;
        if (branch === 'b') throw new Error('CONFLICT');
      },
      rebaseInProgress: async () => current === 'b',
      abort: async () => {
        aborted.push('abort');
      },
    });
    expect(aborted).toEqual(['abort']);
    expect(outcomes.blocked).toBe(false);
    expect(outcomes.outcomes).toEqual([
      { branch: 'a', status: 'rebased' },
      { branch: 'b', status: 'skipped', reason: 'CONFLICT' },
      { branch: 'c', status: 'rebased' },
    ]);
  });

  it('aborts and stops the rest when failure means stop', async () => {
    const calls: string[] = [];
    const run = await rebaseBranchesSequence(['a', 'b', 'c'], 'stop', {
      rebase: async (branch) => {
        calls.push(branch);
        if (branch === 'a') throw new Error('CONFLICT');
      },
      rebaseInProgress: async () => true,
      abort: async () => {
        calls.push('abort');
      },
    });
    expect(calls).toEqual(['a', 'abort']);
    expect(run.outcomes.map((outcome) => outcome.status)).toEqual(['skipped', 'notRun', 'notRun']);
    expect(run.blocked).toBe(false);
  });

  it('skips a failure that never started a rebase without aborting', async () => {
    const aborted: string[] = [];
    const run = await rebaseBranchesSequence(['a', 'b'], 'skip', {
      rebase: async (branch) => {
        if (branch === 'a') throw new Error('already used by worktree');
      },
      rebaseInProgress: async () => false,
      abort: async () => {
        aborted.push('abort');
      },
    });
    expect(aborted).toEqual([]);
    expect(run.outcomes).toEqual([
      { branch: 'a', status: 'skipped', reason: 'already used by worktree' },
      { branch: 'b', status: 'rebased' },
    ]);
  });

  it('stops the batch when abort fails', async () => {
    const calls: string[] = [];
    const run = await rebaseBranchesSequence(['a', 'b'], 'skip', {
      rebase: async (branch) => {
        calls.push(branch);
        throw new Error('CONFLICT');
      },
      rebaseInProgress: async () => true,
      abort: async () => {
        throw new Error('abort failed');
      },
    });
    expect(calls).toEqual(['a']);
    expect(run.blocked).toBe(true);
    expect(run.outcomes[0]).toMatchObject({ branch: 'a', status: 'skipped' });
    expect(run.outcomes[0]?.reason).toContain('abort failed');
    expect(run.outcomes[1]).toEqual({ branch: 'b', status: 'notRun' });
  });
});
