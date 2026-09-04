import { describe, expect, it } from 'vitest';
import { pushBranchArgs } from './gitArgs';

describe('pushBranchArgs', () => {
  const base = { kind: 'pushBranch' as const, name: 'main', remotes: ['origin'], setUpstream: false, mode: 'normal' as const };

  it('pushes normally', () => {
    expect(pushBranchArgs(base, 'origin', false)).toEqual(['push', 'origin', 'main']);
  });

  it('sets upstream with -u', () => {
    expect(pushBranchArgs({ ...base, setUpstream: true }, 'origin', true)).toEqual(['push', '-u', 'origin', 'main']);
  });

  it('uses --force-with-lease', () => {
    expect(pushBranchArgs({ ...base, mode: 'force-with-lease' }, 'origin', false)).toEqual([
      'push',
      '--force-with-lease',
      'origin',
      'main',
    ]);
  });

  it('uses --force', () => {
    expect(pushBranchArgs({ ...base, mode: 'force' }, 'fork', false)).toEqual(['push', '--force', 'fork', 'main']);
  });
});
