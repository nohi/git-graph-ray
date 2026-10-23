import { describe, expect, it } from 'vitest';
import { UNMERGED_BRANCH_MESSAGE, deleteBranchConfirm, deleteBranchDialogHtml } from './deleteBranch';

describe('deleteBranchDialogHtml', () => {
  it('includes the force checkbox and a hidden unmerged warning', () => {
    const html = deleteBranchDialogHtml(false);
    expect(html).toContain('id="fr" ');
    expect(html).not.toContain('id="fr" checked');
    expect(html).toContain('id="del-unmerged"');
    expect(html).toContain('hidden');
    expect(html).toContain(UNMERGED_BRANCH_MESSAGE);
  });

  it('checks force when that is the saved default', () => {
    expect(deleteBranchDialogHtml(true)).toContain('id="fr" checked');
  });
});

describe('deleteBranchConfirm', () => {
  it('keeps the unmerged warning visible and enables OK only when force is checked', () => {
    expect(deleteBranchConfirm('unmerged', false)).toEqual({ showWarning: true, okEnabled: false });
    expect(deleteBranchConfirm('unmerged', true)).toEqual({ showWarning: true, okEnabled: true });
  });

  it('allows a merged branch without force', () => {
    expect(deleteBranchConfirm('merged', false)).toEqual({ showWarning: false, okEnabled: true });
  });

  it('holds OK while the merge check is in flight and force is off', () => {
    expect(deleteBranchConfirm('pending', false)).toEqual({ showWarning: false, okEnabled: false });
    expect(deleteBranchConfirm('pending', true)).toEqual({ showWarning: false, okEnabled: true });
  });

  it('does not block when the check failed', () => {
    expect(deleteBranchConfirm('unknown', false)).toEqual({ showWarning: false, okEnabled: true });
  });
});
