export const UNMERGED_BRANCH_MESSAGE =
  'This branch is not fully merged and cannot be deleted unless force is checked.';

/** `pending` until git answers. `unknown` when the check itself failed. */
export type BranchMergeState = 'pending' | 'merged' | 'unmerged' | 'unknown';

export function deleteBranchDialogHtml(force: boolean): string {
  const checked = force ? 'checked' : '';
  return `<label><input type="checkbox" id="fr" ${checked}/> force</label><p id="del-unmerged" class="dlg-warn" role="status" hidden>${UNMERGED_BRANCH_MESSAGE}</p>`;
}

/** `git branch -d` refuses an unmerged branch. Force is the only way through. */
export function deleteBranchConfirm(state: BranchMergeState, force: boolean): { showWarning: boolean; okEnabled: boolean } {
  if (force) return { showWarning: false, okEnabled: true };
  if (state === 'unmerged') return { showWarning: true, okEnabled: false };
  if (state === 'pending') return { showWarning: false, okEnabled: false };
  return { showWarning: false, okEnabled: true };
}
