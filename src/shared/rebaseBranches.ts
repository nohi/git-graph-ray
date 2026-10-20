import { escapeHtml } from './issueLinks';

export type RebaseBranchesCheckout = 'restore' | 'stay';
export type RebaseBranchesOnFailure = 'skip' | 'stop';

export type RebaseBranchOutcome = {
  branch: string;
  status: 'rebased' | 'skipped' | 'notRun';
  reason?: string;
};

export type RebaseBranchesRun = {
  outcomes: RebaseBranchOutcome[];
  /** A conflicted rebase is still in progress, so later checkouts must not run. */
  blocked: boolean;
};

export type HeadCheckout = { branch: string | null; hash: string | null };

/** Selected local branches, in click order. `onto` drops that branch so it is not rebased onto itself. */
export function rebaseTargetBranches(selected: readonly string[], onto?: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const name of selected) {
    if (!name || (onto !== undefined && name === onto) || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

export function parseRebaseCheckout(value: string | null | undefined): RebaseBranchesCheckout {
  return value === 'stay' ? 'stay' : 'restore';
}

export function parseRebaseOnFailure(value: string | null | undefined): RebaseBranchesOnFailure {
  return value === 'stop' ? 'stop' : 'skip';
}

export function restoreCheckoutArgs(head: HeadCheckout): string[] | null {
  if (head.branch) return ['checkout', head.branch];
  if (head.hash) return ['checkout', '--detach', head.hash];
  return null;
}

export function rebaseBranchesDialogHtml(opts: { onto: string; branches: readonly string[]; ignoreDate: boolean }): string {
  const items = opts.branches.map((name) => `<li><code>${escapeHtml(name)}</code></li>`).join('');
  const ignore = opts.ignoreDate ? ' checked' : '';
  return `<p class="dlg-note">Rebase onto <code>${escapeHtml(opts.onto)}</code></p>
<ul class="rebase-list">${items}</ul>
<label><input type="checkbox" id="id"${ignore}/> ignore date</label>
<fieldset class="dlg-stack">
  <legend>After rebase</legend>
  <label><input type="radio" name="rb-co" value="restore" checked /> Return to the previous branch</label>
  <label><input type="radio" name="rb-co" value="stay" /> Stay on the last branch</label>
</fieldset>
<fieldset class="dlg-stack">
  <legend>On failure</legend>
  <label><input type="radio" name="rb-fail" value="skip" checked /> Skip and continue</label>
  <label><input type="radio" name="rb-fail" value="stop" /> Stop</label>
</fieldset>`;
}

/** Null when every branch rebased and checkout was restored. */
export function rebaseBranchesReportHtml(outcomes: readonly RebaseBranchOutcome[], restoreError?: string): string | null {
  const skipped = outcomes.filter((outcome) => outcome.status === 'skipped');
  const notRun = outcomes.filter((outcome) => outcome.status === 'notRun');
  if (!skipped.length && !notRun.length && !restoreError) return null;
  const rebased = outcomes.filter((outcome) => outcome.status === 'rebased');
  const parts: string[] = [];
  if (rebased.length) parts.push(reportSection('Rebased', rebased.map((outcome) => escapeHtml(outcome.branch))));
  if (skipped.length) {
    parts.push(
      reportSection(
        'Skipped',
        skipped.map((outcome) => `${escapeHtml(outcome.branch)} — ${escapeHtml(outcome.reason || 'rebase failed')}`),
      ),
    );
  }
  if (notRun.length) parts.push(reportSection('Not run', notRun.map((outcome) => escapeHtml(outcome.branch))));
  if (restoreError) parts.push(`<p class="dlg-warn">${escapeHtml(restoreError)}</p>`);
  return parts.join('');
}

export async function rebaseBranchesSequence(
  branches: readonly string[],
  onFailure: RebaseBranchesOnFailure,
  ops: {
    rebase: (branch: string) => Promise<void>;
    rebaseInProgress: () => Promise<boolean>;
    abort: () => Promise<void>;
  },
): Promise<RebaseBranchesRun> {
  const outcomes: RebaseBranchOutcome[] = [];
  const stopRest = (from: number) => {
    for (const branch of branches.slice(from)) outcomes.push({ branch, status: 'notRun' });
  };
  for (let i = 0; i < branches.length; i++) {
    const branch = branches[i]!;
    try {
      await ops.rebase(branch);
      outcomes.push({ branch, status: 'rebased' });
    } catch (error) {
      const reason = errorMessage(error);
      let inProgress = false;
      try {
        inProgress = await ops.rebaseInProgress();
      } catch (statusError) {
        outcomes.push({ branch, status: 'skipped', reason: `${reason}\n${errorMessage(statusError)}` });
        stopRest(i + 1);
        return { outcomes, blocked: true };
      }
      if (inProgress) {
        try {
          await ops.abort();
        } catch (abortError) {
          outcomes.push({ branch, status: 'skipped', reason: `${reason}\n${errorMessage(abortError)}` });
          stopRest(i + 1);
          return { outcomes, blocked: true };
        }
      }
      outcomes.push({ branch, status: 'skipped', reason });
      if (onFailure === 'stop') {
        stopRest(i + 1);
        break;
      }
    }
  }
  return { outcomes, blocked: false };
}

function reportSection(title: string, items: string[]): string {
  return `<p class="dlg-note">${escapeHtml(title)}</p><ul class="rebase-list">${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;
}

function errorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  const trimmed = text.trim();
  return trimmed || 'rebase failed';
}
