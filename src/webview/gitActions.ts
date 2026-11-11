import { t } from '@vscode/l10n';
import { startCheckoutFromRef } from '../shared/checkout';
import { rebaseRevision } from '../shared/gitArgs';
import { checkSquashRange, cherryPickPlan, patchFileName } from '../shared/historyActions';
import { fillPrUrl } from '../shared/issueLinks';
import { parseRebaseCheckout, parseRebaseOnFailure, rebaseBranchesDialogHtml, rebaseTargetBranches } from '../shared/rebaseBranches';
import { UNCOMMITTED } from '../shared/types';
import { rayCatCherryPick } from './rayCat';
import type { GraphSnapshot } from '../shared/protocol';
import type { GraphCommit } from '../shared/types';
import { post } from './host';
import { state } from './state';
import { $, clickPoint, esc } from './dom';
import { sendGit } from './undoUi';
import { gitDialog } from './dialogsUi';

export const pickWaiters = new Map<string, (result: { path: string | null; patchKind?: 'am' | 'apply' }) => void>();

export function checkoutChip(chip: HTMLElement): void {
  if (!state.snap) return;
  const kind = chip.dataset.kind ?? '';
  if (kind !== 'head' && kind !== 'remote') return;
  const plan = startCheckoutFromRef(
    state.snap.commits,
    { kind, name: chip.dataset.name ?? '', remote: chip.dataset.remote, hash: chip.dataset.hash },
    state.snap.currentBranch,
  );
  runPlan(plan);
}

export function runPlan(plan: ReturnType<typeof startCheckoutFromRef>, at?: { x: number; y: number }): void {
  if (plan.kind === 'local') sendGit({ kind: 'checkoutBranch', name: plan.name });
  if (plan.kind === 'promptCreate') {
    gitDialog(
      t('Checkout remote branch'),
      `<p>${t('Checkout {0}?', `<code>${esc(plan.remoteBranch)}</code>`)}</p><label>${t('Local name')} <input id="ln" value="${esc(plan.localName)}" /></label>`,
      () => {
        sendGit({
          kind: 'checkoutRemote',
          remoteBranch: plan.remoteBranch,
          localName: (document.getElementById('ln') as HTMLInputElement).value,
        });
      },
      at,
    );
  }
  if (plan.kind === 'confirmPull') {
    gitDialog(
      t('Checkout existing branch'),
      `<p>${t('Local branch {0} is at a different commit.', `<code>${esc(plan.name)}</code>`)}</p>
       <label><input type="checkbox" id="do-pull" checked /> ${t('Pull from {0} after checkout', esc(plan.remote))}</label>`,
      () => {
        const pull = (document.getElementById('do-pull') as HTMLInputElement).checked;
        sendGit({
          kind: 'checkoutBranch',
          name: plan.name,
          pullAfterwards: pull
            ? {
                remote: plan.remote,
                branch: plan.branch,
                noFastForward: state.snap!.config.dialogs.pullRebase ? false : state.snap!.config.dialogs.pullNoFastForward,
                rebase: state.snap!.config.dialogs.pullRebase,
                squash: state.snap!.config.dialogs.pullRebase ? false : state.snap!.config.dialogs.pullSquash,
                squashMessageFormat: state.snap!.config.dialogs.pullSquashMessageFormat,
              }
            : undefined,
        });
      },
      at,
    );
  }
}

export function togglePickedBranch(chip: HTMLElement): boolean {
  if (chip.dataset.kind !== 'head' || !chip.dataset.name || chip.dataset.name === 'HEAD') return false;
  const name = chip.dataset.name;
  const index = state.pickedBranches.indexOf(name);
  if (index >= 0) state.pickedBranches.splice(index, 1);
  else state.pickedBranches.push(name);
  return true;
}

export function rebaseSelectionBlock(): string | undefined {
  if (state.snap?.operation) return t('A Git operation is already in progress');
  if (state.snap?.commits.some((commit) => commit.hash === UNCOMMITTED)) return t('Commit or stash changes first');
  return undefined;
}

export function selectedRebaseState(ontoBranch?: string): { count: number; disabledReason?: string } | undefined {
  const branches = rebaseTargetBranches(state.pickedBranches, ontoBranch);
  if (!branches.length) return undefined;
  return { count: branches.length, disabledReason: rebaseSelectionBlock() };
}

export function openSelectedRebase(ev: Event): void {
  if (!state.snap || rebaseSelectionBlock()) return;
  const spec = rebaseTargetSpec();
  if (!spec) return;
  const branches = rebaseTargetBranches(state.pickedBranches, spec.drop);
  if (!branches.length) return;
  const d = state.snap.config.dialogs;
  gitDialog(
    t('Rebase'),
    rebaseBranchesDialogHtml({ onto: spec.label, branches, ignoreDate: d.rebaseIgnoreDate }),
    () => {
      const body = $('git-body');
      sendGit({
        kind: 'rebaseBranches',
        onto: spec.onto,
        branches,
        ignoreDate: (document.getElementById('id') as HTMLInputElement).checked,
        checkout: parseRebaseCheckout(body.querySelector<HTMLInputElement>('input[name="rb-co"]:checked')?.value),
        onFailure: parseRebaseOnFailure(body.querySelector<HTMLInputElement>('input[name="rb-fail"]:checked')?.value),
      });
    },
    clickPoint(ev),
  );
}

export function rebaseTargetSpec(): { label: string; onto: string; drop?: string } | null {
  if (state.ctxCommit && state.ctxCommit.hash !== UNCOMMITTED) {
    const hash = state.ctxCommit.hash;
    return { label: hash.slice(0, 7), onto: hash };
  }
  const ref = state.ctxRef;
  if (!ref || (ref.kind !== 'head' && ref.kind !== 'remote' && ref.kind !== 'tag') || !ref.name || ref.name === 'HEAD') return null;
  return {
    label: ref.name,
    onto: rebaseRevision(ref.kind, ref.name),
    drop: ref.kind === 'head' ? ref.name : undefined,
  };
}

export function interactiveRebaseRef(): string | null {
  if (state.ctxCommit && state.ctxCommit.hash !== UNCOMMITTED) return state.ctxCommit.hash;
  const ref = state.ctxRef;
  if (!ref || (ref.kind !== 'head' && ref.kind !== 'remote' && ref.kind !== 'tag') || !ref.name || ref.name === 'HEAD') return null;
  if (ref.kind === 'head' && ref.name === state.snap?.currentBranch) return null;
  return rebaseRevision(ref.kind, ref.name);
}

export function rangePlan(hash: string): ReturnType<typeof cherryPickPlan> | null {
  if (!state.snap || state.commitRange.length < 2 || !state.commitRange.includes(hash)) return null;
  return cherryPickPlan(state.snap.commits, state.commitRange);
}

export function rangeCherryItem(hash: string): { id: string; label: string; disabled?: boolean; title?: string } | undefined {
  const plan = rangePlan(hash);
  if (!plan) return undefined;
  if (!plan.commits.length) return { id: 'c-cp', label: t('Cherry-pick'), disabled: true, title: t('Merge commits cannot be cherry-picked as a range') };
  const count = plan.commits.length;
  return { id: 'c-cp', label: count === 1 ? t('Cherry-pick 1 commit') : t('Cherry-pick {0} commits', count) };
}

export function rangePatchItem(hash: string): { id: string; label: string; disabled?: boolean; title?: string } | undefined {
  const plan = rangePlan(hash);
  if (!plan) return undefined;
  if (!plan.commits.length) return { id: 'c-patch', label: t('Create patch'), disabled: true, title: t('Merge commits in the range are skipped') };
  const count = plan.commits.length;
  return count === 1 ? { id: 'c-patch', label: t('Create patch') } : { id: 'c-patch', label: t('Create patch for {0} commits', count) };
}

export function rangeSquashItem(hash: string): { id: string; label: string; disabled?: boolean; title?: string } | undefined {
  if (!state.snap || state.commitRange.length < 2 || !state.commitRange.includes(hash)) return undefined;
  const check = checkSquashRange({
    commits: state.snap.commits,
    range: state.commitRange,
    tip: state.snap.head,
    branch: state.snap.currentBranch,
    busy: state.snap.operation != null,
  });
  if (!check.ok) return { id: 'c-sq', label: t('Squash'), disabled: true, title: check.reason };
  return { id: 'c-sq', label: t('Squash {0} commits', check.hashes.length) };
}

export function pullDialogHtml(d: GraphSnapshot['config']['dialogs']): string {
  return `<label><input type="checkbox" id="rb" ${d.pullRebase ? 'checked' : ''}/> rebase</label>
    <label><input type="checkbox" id="nff" ${d.pullNoFastForward && !d.pullRebase ? 'checked' : ''}/> no ff</label>
    <label><input type="checkbox" id="sq" ${d.pullSquash && !d.pullRebase ? 'checked' : ''}/> squash</label>`;
}

export function bindPullMode(): void {
  const rebase = document.getElementById('rb') as HTMLInputElement | null;
  const noFf = document.getElementById('nff') as HTMLInputElement | null;
  const squash = document.getElementById('sq') as HTMLInputElement | null;
  if (!rebase || !noFf || !squash) return;
  const sync = () => {
    if (rebase.checked) {
      noFf.checked = false;
      squash.checked = false;
    }
    noFf.disabled = rebase.checked;
    squash.disabled = rebase.checked;
  };
  rebase.addEventListener('change', sync);
  for (const box of [noFf, squash]) {
    box.addEventListener('change', () => {
      if (box.checked) rebase.checked = false;
      sync();
    });
  }
  sync();
}

export function requestPick(kind: 'save' | 'open', opts: { title: string; defaultName?: string }): Promise<{ path: string | null; patchKind?: 'am' | 'apply' }> {
  const requestId = `pick${++state.pickSeq}`;
  return new Promise((resolve) => {
    pickWaiters.set(requestId, resolve);
    if (kind === 'save') post({ type: 'pickSaveFile', requestId, title: opts.title, defaultName: opts.defaultName ?? 'changes.patch' });
    else post({ type: 'pickOpenFile', requestId, title: opts.title });
  });
}

export function patchBaseName(filePath: string): string {
  const index = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return index >= 0 ? filePath.slice(index + 1) : filePath;
}

export function commitsForPatch(commit: GraphCommit): { hash: string; parents: string[] }[] {
  const plan = rangePlan(commit.hash);
  if (plan?.commits.length) return plan.commits;
  return [{ hash: commit.hash, parents: commit.parents }];
}

export function openCherryDialog(commit: GraphCommit, at: { x: number; y: number }): void {
  if (!state.snap) return;
  const plan = rangePlan(commit.hash);
  const picked = plan?.commits.length ? plan.commits : [{ hash: commit.hash, parents: commit.parents }];
  if (!picked.length) return;
  const subjects = new Map(state.snap.commits.map((row) => [row.hash, row.subject]));
  const rows = picked.map((row) => ({ hash: row.hash, subject: subjects.get(row.hash) ?? '' }));
  const skipped = plan?.skippedMerges ?? 0;
  const d = state.snap.config.dialogs;
  const list = rows.map((row) => `<li><code>${esc(row.hash.slice(0, 7))}</code> ${esc(row.subject)}</li>`).join('');
  const note = skipped
    ? `<p>${skipped === 1 ? t('{0} merge commit is skipped.', skipped) : t('{0} merge commits are skipped.', skipped)}</p>`
    : '';
  const heading = rows.length === 1 ? t('Cherry-pick this commit?') : t('Cherry-pick {0} commits, oldest first?', rows.length);
  gitDialog(
    t('Cherry-pick'),
    `<p>${heading}</p>${note}<ul class="dlg-files dlg-cherry">${list}</ul><label><input type="checkbox" id="nc" ${d.cherryPickNoCommit ? 'checked' : ''}/> no commit</label>`,
    () => {
      state.commitRange = [];
      rayCatCherryPick(commit.hash);
      sendGit({
        kind: 'cherryPick',
        hashes: rows.map((row) => row.hash),
        noCommit: (document.getElementById('nc') as HTMLInputElement).checked,
        recordOrigin: d.cherryPickRecordOrigin,
      });
    },
    at,
  );
}

export async function saveCommitPatch(commit: GraphCommit): Promise<void> {
  const commits = commitsForPatch(commit);
  const name = commits.length === 1 ? patchFileName(commit.subject) : patchFileName(`${commits.length} commits`);
  const picked = await requestPick('save', { title: t('Create patch'), defaultName: name });
  if (!picked.path) return;
  state.commitRange = [];
  sendGit({ kind: 'createCommitPatch', destination: picked.path, commits });
}

export async function saveFilePatch(files: { path: string; untracked: boolean }[]): Promise<void> {
  if (!state.details || !files.length) return;
  const name = files.length === 1 ? patchFileName(patchBaseName(files[0]!.path).replace(/\.patch$/, '')) : patchFileName(`${files.length} files`);
  const picked = await requestPick('save', { title: t('Create patch'), defaultName: name });
  if (!picked.path) return;
  if (state.details.hash === UNCOMMITTED) {
    sendGit({ kind: 'createWorktreePatch', destination: picked.path, files });
    return;
  }
  sendGit({
    kind: 'createFilePatch',
    destination: picked.path,
    hash: state.details.hash,
    parent: state.details.parents[0],
    paths: files.map((file) => file.path),
  });
}

export async function saveWorktreePatch(): Promise<void> {
  const picked = await requestPick('save', { title: t('Create patch'), defaultName: 'changes.patch' });
  if (!picked.path) return;
  sendGit({ kind: 'createWorktreePatch', destination: picked.path });
}

export async function startApplyPatch(): Promise<void> {
  const picked = await requestPick('open', { title: t('Apply patch') });
  if (!picked.path) return;
  const file = picked.path;
  const commits = picked.patchKind === 'am';
  gitDialog(
    t('Apply patch'),
    `<p>${t('Apply {0}', `<code>${esc(patchBaseName(file))}</code>`)}</p><label><input type="checkbox" id="am" ${commits ? 'checked' : ''}/> ${t('Create commits')}</label>`,
    () => sendGit({ kind: 'applyPatch', file, commits: (document.getElementById('am') as HTMLInputElement).checked }),
  );
}

export function stashSelected(files: { path: string }[], at: { x: number; y: number }): void {
  if (!files.length) return;
  const list = files.map((file) => `<li><code>${esc(file.path)}</code></li>`).join('');
  const heading = files.length === 1 ? t('Stash this file?') : t('Stash {0} files?', files.length);
  gitDialog(
    t('Stash'),
    `<p>${heading}</p><ul class="dlg-files">${list}</ul><label class="dlg-field">${t('Message')} <input id="sm" /></label>`,
    () => {
      const message = (document.getElementById('sm') as HTMLInputElement).value.trim();
      sendGit({ kind: 'stash', includeUntracked: true, paths: files.map((file) => file.path), ...(message ? { message } : {}) });
    },
    at,
  );
}

export function openPr(branch: string): void {
  if (!state.snap) return;
  const p = state.snap.repoSettings.pullRequest?.provider ?? 'GitHub';
  const custom = state.snap.customPrProviders.find((x) => x.name === p);
  const tpl =
    custom?.templateUrl ??
    (p === 'GitLab'
      ? 'https://gitlab.com/$1/-/merge_requests/new?merge_request[source_branch]=$2'
      : p === 'Bitbucket'
        ? 'https://bitbucket.org/$1/pull-requests/new?source=$2'
        : 'https://github.com/$1/compare/$2');
  const origin = state.snap.remotes[0]?.fetchUrl ?? '';
  const repo = origin.replace(/^.*[:/]([^/]+\/[^/.]+)(?:\.git)?$/, '$1');
  post({ type: 'openUrl', url: fillPrUrl(tpl, { repo, source: branch, dest: state.snap.currentBranch ?? 'main' }) });
}
