import { t } from '@vscode/l10n';
import { amendDialogHtml } from '../shared/amendDialog';
import { decideNamedRemoteCheckout } from '../shared/checkout';
import { branchMenuEntries, canAmendHead, commitMenuEntries, menuHtml, remoteMenuEntries, tagMenuEntries } from '../shared/commitMenu';
import { deleteBranchDialogHtml } from '../shared/deleteBranch';
import { applySpaceSubstitution } from '../shared/dialogs';
import { folderFoldPlan, folderMenu } from '../shared/fileTree';
import { rebaseRevision } from '../shared/gitArgs';
import { gitAtLeast } from '../shared/graph';
import { checkSquashRange } from '../shared/historyActions';
import { addTagDialogHtml, parsePushMode, pushBranchDialogHtml, pushTagDialogHtml } from '../shared/pushDialog';
import { copySelectionItem } from '../shared/selectionCopy';
import { UNCOMMITTED } from '../shared/types';
import { defaultWorktreeLocation, suggestedWorktreeFolder, worktreeDialogHtml, worktreeFormState } from '../shared/worktreeDialog';
import { rayCatAddTag, rayCatBurnBranch, rayCatCreateBranch, rayCatDeleteTag, rayCatPull, rayCatPushBranch, rayCatRenameBranch } from './rayCat';
import type { GitAction } from '../shared/protocol';
import type { GraphRef } from '../shared/types';
import { post } from './host';
import { persistView, state } from './state';
import { $, btn, clearCompare, clickPoint, esc, joinRepoPath, namedBranch, showCopiedToast, val, vis } from './dom';
import { openCtx } from './popovers';
import { applyFolderFold, paint } from './paint';
import { sendGit } from './undoUi';
import { postDiff } from './detailsUi';
import { canCompareWithHead, gitDialog, mergeBody, openCompareDialog, openLabelColourDialog, rebaseBody, selectedPushRemotes, showConfirmTip, startCompare, syncWorktreeForm, watchRemoteTags } from './dialogsUi';
import { bindPullMode, interactiveRebaseRef, openCherryDialog, openPr, openSelectedRebase, pullDialogHtml, rangeCherryItem, rangePatchItem, rangeSquashItem, runPlan, saveCommitPatch, saveFilePatch, saveWorktreePatch, selectedRebaseState, startApplyPatch, stashSelected } from './gitActions';

export function openSelectionCopy(x: number, y: number): void {
  state.ctxCommit = null;
  state.ctxRef = null;
  state.ctxFile = null;
  state.ctxFolder = null;
  state.ctxCopyText = document.getSelection()?.toString() ?? '';
  openCtx(menuHtml([copySelectionItem(state.ctxCopyText)]), x, y);
}

export function menuRef(chip: HTMLElement, x: number, y: number): void {
  state.ctxFolder = null;
  const kind = chip.dataset.kind ?? '';
  const name = chip.dataset.name ?? '';
  const items: string[] = [];
  if (kind === 'worktree') {
    if (vis('worktree', 'open')) items.push(btn('wt-open', t('Open here')));
    if (vis('worktree', 'openNew')) items.push(btn('wt-new', t('Open new window')));
    if (vis('worktree', 'remove')) items.push(btn('wt-del', t('Remove')));
  } else if (kind === 'stash') {
    if (vis('stash', 'apply')) items.push(btn('st-apply', t('Apply')));
    if (vis('stash', 'pop')) items.push(btn('st-pop', t('Pop')));
    if (vis('stash', 'branch')) items.push(btn('st-br', t('Branch')));
    if (vis('stash', 'drop')) items.push(btn('st-drop', t('Drop')));
    items.push(btn('copy', t('Copy name')));
  } else if (kind === 'tag') {
    state.ctxCommit = null;
    state.ctxFile = null;
    state.ctxRef = { kind: 'tag', name, hash: chip.dataset.hash ?? '' };
    openCtx(
      menuHtml(
        tagMenuEntries({
          visible: (id) => vis('tag', id),
          selectedRebase: selectedRebaseState(),
        }),
      ),
      x,
      y,
    );
    return;
  } else if (kind === 'head') {
    if (name === 'HEAD') items.push(btn('copy', t('Copy name')));
    else {
      state.ctxCommit = null;
      state.ctxFile = null;
      state.ctxRef = { kind: kind as GraphRef['kind'], name, hash: chip.dataset.hash ?? '', remote: chip.dataset.remote, worktreePath: chip.dataset.wt };
      openCtx(
        menuHtml(
          branchMenuEntries({
            current: name === state.snap?.currentBranch,
            withHead: canCompareWithHead(chip.dataset.hash ?? ''),
            visible: (id) => vis('branch', id),
            selectedRebase: selectedRebaseState(name),
          }),
        ),
        x,
        y,
      );
      return;
    }
  } else if (kind === 'remote') {
    state.ctxCommit = null;
    state.ctxFile = null;
    state.ctxRef = { kind: 'remote', name, hash: chip.dataset.hash ?? '', remote: chip.dataset.remote };
    openCtx(
      menuHtml(
        remoteMenuEntries({
          withHead: canCompareWithHead(chip.dataset.hash ?? ''),
          visible: (id) => vis('remote', id),
          selectedRebase: selectedRebaseState(),
        }),
      ),
      x,
      y,
    );
    return;
  }
  state.ctxCommit = null;
  state.ctxFile = null;
  state.ctxRef = { kind: kind as GraphRef['kind'], name, hash: chip.dataset.hash ?? '', remote: chip.dataset.remote, worktreePath: chip.dataset.wt };
  openCtx(items.join(''), x, y);
}

export function menuCommit(hash: string, x: number, y: number): void {
  state.ctxFolder = null;
  const c = state.snap?.commits.find((x) => x.hash === hash);
  if (!c || !state.snap) return;
  state.ctxCommit = c;
  state.ctxRef = null;
  state.ctxFile = null;
    if (hash === UNCOMMITTED) {
    const items: string[] = [];
    if (vis('uncommitted', 'stash')) items.push(btn('u-st', t('Stash')));
    if (vis('uncommitted', 'patch')) items.push(btn('u-patch', t('Create patch')));
    if (vis('uncommitted', 'applyPatch')) items.push(btn('apply-patch', t('Apply patch')));
    if (vis('uncommitted', 'reset')) items.push(btn('u-rs', t('Reset')));
    if (vis('uncommitted', 'clean')) items.push(btn('u-cl', t('Clean')));
    if (vis('uncommitted', 'scm')) items.push(btn('u-scm', t('Open SCM')));
    openCtx(items.join(''), x, y);
    return;
  }
  openCtx(
    `${menuHtml(
      commitMenuEntries({
        canReword: gitAtLeast(state.snap.config.gitMajorMinor, 2, 54),
        canAmend: canAmendHead({ hash, head: state.snap.head, currentBranch: state.snap.currentBranch, busy: state.snap.operation != null }),
        isMerge: c.parents.length > 1,
        withHead: canCompareWithHead(hash),
        visible: (id) => vis('commit', id),
        cherryPick: rangeCherryItem(hash),
        createPatch: rangePatchItem(hash),
        squashRange: rangeSquashItem(hash),
        selectedRebase: selectedRebaseState(),
      }),
    )}`,
    x,
    y,
  );
}

export function openSquashDialog(): void {
  if (!state.snap) return;
  const item = state.ctxCommit ? rangeSquashItem(state.ctxCommit.hash) : undefined;
  if (!item || item.disabled) return;
  const check = checkSquashRange({
    commits: state.snap.commits,
    range: state.commitRange,
    tip: state.snap.head,
    branch: state.snap.currentBranch,
    busy: state.snap.operation != null,
  });
  if (!check.ok) return;
  const subjects = new Map(state.snap.commits.map((row) => [row.hash, row.subject]));
  const initial = check.hashes.map((hash) => subjects.get(hash) ?? hash.slice(0, 7)).join('\n\n');
  gitDialog(
    t('Squash'),
    `<textarea id="sq-msg" rows="6">${esc(initial)}</textarea>`,
    () => {
      const message = (document.getElementById('sq-msg') as HTMLTextAreaElement).value.trim();
      if (!message) return;
      state.commitRange = [];
      state.rangeAnchor = null;
      sendGit({ kind: 'squashRange', base: check.base, hashes: check.hashes, message });
    },
    { x: state.lastPointer.x, y: state.lastPointer.y },
  );
}

export function openAmendDialog(commit: { hash: string; subject: string }): void {
  if (!state.snap) return;
  if (state.details?.hash === commit.hash) {
    showAmendDialog(commit.hash, commit.subject, state.details.body);
    return;
  }
  state.pendingAmend = commit.hash;
  post({ type: 'openRow', hash: commit.hash });
}

export function showAmendDialog(hash: string, subject: string, body: string): void {
  state.pendingAmend = null;
  const at = { x: state.lastPointer.x, y: state.lastPointer.y };
  gitDialog(
    t('Amend'),
    amendDialogHtml({ subject, body, includeStaged: false }),
    () => {
      const nextSubject = (document.getElementById('am-subject') as HTMLInputElement).value.trim();
      const nextBody = (document.getElementById('am-body') as HTMLTextAreaElement).value.replace(/^\n+/, '').replace(/\s+$/, '');
      if (!nextSubject) return;
      sendGit({ kind: 'amendHead', hash, message: nextBody ? `${nextSubject}\n\n${nextBody}` : nextSubject, includeStaged: val('am-staged') });
    },
    at,
  );
}

export function onMenu(ev: Event): void {
  const id = (ev.target as HTMLElement).dataset.act;
  if (!id) return;
  $('pop-ctx').hidePopover?.();
  if (id === 'copy-sel') {
    if (!state.ctxCopyText) return;
    post({ type: 'copy', text: state.ctxCopyText });
    showCopiedToast((ev as MouseEvent).clientX, (ev as MouseEvent).clientY);
    return;
  }
  const folderItem = folderMenu().find((item) => item.id === id);
  if (folderItem?.action) {
    const folder = state.ctxFolder;
    if (folder?.isConnected) applyFolderFold(folder, folderFoldPlan(folder.open, folderItem.action));
    return;
  }
  if (folderItem?.command && state.ctxFolder) {
    const rel = state.ctxFolder.dataset.path ?? '';
    if (folderItem.command === 'copy-path') {
      post({ type: 'copy', text: rel });
      showCopiedToast((ev as MouseEvent).clientX, (ev as MouseEvent).clientY);
    } else if (folderItem.command === 'copy-full-path') {
      post({ type: 'copy', text: joinRepoPath(rel) });
      showCopiedToast((ev as MouseEvent).clientX, (ev as MouseEvent).clientY);
    }     else post({ type: 'openFolder', path: rel });
    return;
  }
  if (id === 'apply-patch' || id === 'c-apply') {
    void startApplyPatch();
    return;
  }
  if (!state.snap) return;
  if (id === 'cmp' || id === 'cmp-head') {
    const base = state.ctxCommit?.hash ?? state.ctxRef?.hash ?? '';
    const baseName = namedBranch(state.ctxRef);
    if (id === 'cmp') openCompareDialog(base, baseName);
    else if (state.snap.head) startCompare(base, state.snap.head, { left: baseName, right: state.snap.currentBranch ?? undefined });
    return;
  }
  const d = state.snap.config.dialogs;
  const sp = d.spaceSubstitution;
  const act = (a: GitAction) => sendGit(a);
  if (id === 'rbi') {
    const ref = interactiveRebaseRef();
    if (ref) act({ kind: 'rebase', ref, ignoreDate: false, interactive: true });
    return;
  }
  if (id === 'br-rbs') {
    openSelectedRebase(ev);
    return;
  }
  if (state.ctxRef) {
    const r = state.ctxRef;
    if (id === 'copy') {
      post({ type: 'copy', text: r.name });
      showCopiedToast((ev as MouseEvent).clientX, (ev as MouseEvent).clientY);
    }
    if (id === 'ref-colour') openLabelColourDialog(r, clickPoint(ev));
    if (id === 'wt-open' && r.worktreePath) act({ kind: 'worktreeOpen', path: r.worktreePath, newWindow: false });
    if (id === 'wt-new' && r.worktreePath) act({ kind: 'worktreeOpen', path: r.worktreePath, newWindow: true });
    if (id === 'wt-del' && r.worktreePath) {
      const p = clickPoint(ev);
      showConfirmTip(t('Remove worktree {0}?', r.worktreePath), () => act({ kind: 'worktreeRemove', path: r.worktreePath!, force: false }), p.x, p.y, t('Remove'));
    }
    if (id === 'st-apply') act({ kind: 'stashApply', name: r.name.split(' ')[0] ?? r.name, pop: false, reinstateIndex: d.applyStashReinstateIndex });
    if (id === 'st-pop') act({ kind: 'stashApply', name: r.name.split(' ')[0] ?? r.name, pop: true, reinstateIndex: d.popStashReinstateIndex });
    if (id === 'st-drop') {
      const p = clickPoint(ev);
      showConfirmTip(t('Drop stash {0}?', r.name), () => act({ kind: 'stashDrop', name: r.name.split(' ')[0] ?? r.name }), p.x, p.y, t('Drop'));
    }
    if (id === 'st-br') gitDialog(t('Branch from stash'), `<input id="bn" />`, () => act({ kind: 'stashCreateBranch', name: applySpaceSubstitution((document.getElementById('bn') as HTMLInputElement).value, sp), stash: r.name.split(' ')[0] ?? r.name }));
    if (id === 'tag-del') {
      const p = clickPoint(ev);
      showConfirmTip(t('Delete tag {0}?', r.name), () => {
        rayCatDeleteTag(r.name);
        act({ kind: 'deleteTag', name: r.name });
      }, p.x, p.y);
    }
    if (id === 'tag-push') {
      gitDialog(t('Push tag'), pushTagDialogHtml(state.snap.remotes.map((x) => x.name)), () => {
        const remotes = selectedPushRemotes();
        if (!remotes.length) return;
        act({ kind: 'pushTag', name: r.name, remotes });
      });
      watchRemoteTags(r.hash, r.name);
    }
    if (id === 'br-co') runPlan({ kind: 'local', name: r.name });
    if (id === 'br-rn') gitDialog(t('Rename'), `<input id="nn" value="${esc(r.name)}" />`, () => {
      const newName = applySpaceSubstitution((document.getElementById('nn') as HTMLInputElement).value, sp);
      rayCatRenameBranch(r.name, newName);
      act({ kind: 'renameBranch', oldName: r.name, newName });
    }, clickPoint(ev));
    if (id === 'br-del') {
      const p = clickPoint(ev);
      const requestId = String(++state.deleteBranchSeq);
      state.deleteBranchReq = requestId;
      state.deleteBranchMerge = 'pending';
      gitDialog(
        t('Delete branch'),
        deleteBranchDialogHtml(d.deleteBranchForce),
        () => {
          rayCatBurnBranch(r.name);
          act({ kind: 'deleteBranch', name: r.name, force: (document.getElementById('fr') as HTMLInputElement).checked });
        },
        p,
      );
      post({ type: 'branchMerged', requestId, name: r.name });
    }
    if (id === 'br-mg') {
      const p = clickPoint(ev);
      gitDialog(t('Merge'), mergeBody(r.name), () => act({ kind: 'merge', ref: r.name, noCommit: val('nc'), noFastForward: val('nff'), squash: val('sq'), squashMessageFormat: d.mergeSquashMessageFormat }), p);
    }
    if (id === 'br-rb') gitDialog(t('Rebase'), rebaseBody(r.name, d.rebaseInteractive), () => act({ kind: 'rebase', ref: r.name, ignoreDate: (document.getElementById('id') as HTMLInputElement).checked, interactive: (document.getElementById('ir') as HTMLInputElement).checked }), clickPoint(ev));
    if (id === 'br-ps') {
      gitDialog(t('Push branch'), pushBranchDialogHtml(state.snap.remotes.map((x) => x.name)), () => {
        const remotes = selectedPushRemotes();
        if (!remotes.length) return;
        rayCatPushBranch(r.name);
        act({
          kind: 'pushBranch',
          name: r.name,
          remotes,
          setUpstream: (document.getElementById('su') as HTMLInputElement).checked,
          mode: parsePushMode($('git-body').querySelector<HTMLInputElement>('input[name="pm"]:checked')?.value),
        });
      }, clickPoint(ev));
    }
    if (id === 'rm-mg') {
      const p = clickPoint(ev);
      gitDialog(t('Merge'), mergeBody(r.name), () => act({ kind: 'merge', ref: rebaseRevision('remote', r.name), noCommit: val('nc'), noFastForward: val('nff'), squash: val('sq'), squashMessageFormat: d.mergeSquashMessageFormat }), p);
    }
    if (id === 'rm-rb') {
      gitDialog(
        t('Rebase'),
        rebaseBody(r.name, d.rebaseInteractive),
        () =>
          act({
            kind: 'rebase',
            ref: rebaseRevision('remote', r.name),
            ignoreDate: (document.getElementById('id') as HTMLInputElement).checked,
            interactive: (document.getElementById('ir') as HTMLInputElement).checked,
          }),
        clickPoint(ev),
      );
    }
    if (id === 'rm-co') runPlan(decideNamedRemoteCheckout(state.snap.commits, r.name, r.name.slice(r.name.indexOf('/') + 1), r.hash, state.snap.currentBranch), clickPoint(ev));
    if (id === 'rm-del') {
      const p = clickPoint(ev);
      showConfirmTip(t('Delete remote branch {0}?', r.name), () => act({ kind: 'deleteRemoteBranch', remote: r.remote ?? r.name.split('/')[0]!, name: r.name }), p.x, p.y);
    }
    if (id === 'rm-fi') act({ kind: 'fetchIntoLocal', local: r.name.slice(r.name.indexOf('/') + 1), remoteRef: r.name, force: d.fetchIntoLocalForce });
    if (id === 'rm-pl') {
      const remote = r.remote ?? 'origin';
      const branch = r.name.slice(r.name.indexOf('/') + 1);
      gitDialog(
        t('Pull'),
        `<p>${t('Pull {0}/{1}', `<code>${esc(remote)}</code>`, `<code>${esc(branch)}</code>`)}</p>${pullDialogHtml(d)}`,
        () => {
          const rebase = val('rb');
          rayCatPull(r.name);
          act({
            kind: 'pullBranch',
            remote,
            branch,
            rebase,
            noFastForward: rebase ? false : val('nff'),
            squash: rebase ? false : val('sq'),
            squashMessageFormat: d.pullSquashMessageFormat,
          });
        },
        clickPoint(ev),
      );
      bindPullMode();
    }
    if (id === 'pr') openPr(r.name);
  }
  if (state.ctxCommit) {
    const c = state.ctxCommit;
    if (id === 'copyh') {
      post({ type: 'copy', text: c.hash });
      showCopiedToast((ev as MouseEvent).clientX, (ev as MouseEvent).clientY);
    }
    if (id === 'copys') {
      post({ type: 'copy', text: c.subject });
      showCopiedToast((ev as MouseEvent).clientX, (ev as MouseEvent).clientY);
    }
    if (id === 'u-st') act({ kind: 'stash', includeUntracked: d.stashIncludeUntracked });
    if (id === 'u-patch') void saveWorktreePatch();
    if (id === 'u-rs') act({ kind: 'reset', hash: 'HEAD', mode: d.resetUncommittedMode });
    if (id === 'u-cl') {
      const p = clickPoint(ev);
      showConfirmTip(t('Delete untracked files?'), () => act({ kind: 'cleanUntracked', directories: true }), p.x, p.y);
    }
    if (id === 'u-scm') act({ kind: 'openScm' });
    if (id === 'c-tag') {
      gitDialog(
        t('Add tag'),
        addTagDialogHtml(state.snap.remotes.map((x) => x.name), {
          annotated: d.addTagType === 'Annotated',
          pushToRemote: d.addTagPushToRemote,
        }),
        () => {
          const remotes = selectedPushRemotes();
          const name = applySpaceSubstitution((document.getElementById('tn') as HTMLInputElement).value, sp);
          rayCatAddTag(c.hash, name);
          act({
            kind: 'addTag',
            hash: c.hash,
            name,
            annotated: (document.getElementById('an') as HTMLInputElement).checked,
            ...(remotes.length ? { pushTo: remotes } : {}),
          });
        },
        clickPoint(ev),
      );
      watchRemoteTags(c.hash, null);
    }
    if (id === 'c-br') {
      const p = clickPoint(ev);
      gitDialog(t('Create branch'), `<input id="bn" /><label><input type="checkbox" id="co" ${d.createBranchCheckOut ? 'checked' : ''}/> ${t('checkout')}</label>`, () => {
        const name = applySpaceSubstitution((document.getElementById('bn') as HTMLInputElement).value, sp);
        const checkout = (document.getElementById('co') as HTMLInputElement).checked;
        rayCatCreateBranch(c.hash, name, checkout);
        act({ kind: 'createBranch', hash: c.hash, name, checkout });
      }, p);
    }
    if (id === 'c-co') act({ kind: 'checkoutCommit', hash: c.hash });
    if (id === 'c-cp') openCherryDialog(c, clickPoint(ev));
    if (id === 'c-sq') openSquashDialog();
    if (id === 'c-patch') void saveCommitPatch(c);
    if (id === 'c-rv') gitDialog(t('Revert'), t('Revert this commit?'), () => act({ kind: 'revert', hash: c.hash }), clickPoint(ev));
    if (id === 'c-dr') {
      const p = clickPoint(ev);
      showConfirmTip(t('Drop this commit and rewrite history?'), () => act({ kind: 'dropCommit', hash: c.hash }), p.x, p.y, t('Drop'));
    }
    if (id === 'c-mg') {
      const p = clickPoint(ev);
      gitDialog(t('Merge'), mergeBody(c.hash.slice(0, 7)), () => act({ kind: 'merge', ref: c.hash, noCommit: val('nc'), noFastForward: val('nff'), squash: val('sq'), squashMessageFormat: d.mergeSquashMessageFormat }), p);
    }
    if (id === 'c-rb') gitDialog(t('Rebase'), rebaseBody(c.hash.slice(0, 7)), () => act({ kind: 'rebase', ref: c.hash, ignoreDate: (document.getElementById('id') as HTMLInputElement).checked, interactive: false }), clickPoint(ev));
    if (id === 'c-rs') gitDialog(t('Reset'), t('Reset current branch?'), () => act({ kind: 'reset', hash: c.hash, mode: d.resetBranchMode }), clickPoint(ev));
    if (id === 'c-wt') {
      const main = state.snap.mainWorktreePath || state.snap.repoPath;
      const rid = 'p' + Date.now();
      gitDialog(
        t('Create worktree'),
        worktreeDialogHtml({
          location: defaultWorktreeLocation(main),
          name: suggestedWorktreeFolder(c.refs, c.hash, state.snap.currentBranch),
          requestId: rid,
        }),
        () => {
          const loc = (document.getElementById('wt-loc') as HTMLInputElement).value;
          const folder = (document.getElementById('wt-name') as HTMLInputElement).value;
          const stored = worktreeFormState(loc, folder, main);
          if (!stored.canCreate) return;
          act({ kind: 'worktreeAdd', hash: c.hash, path: stored.destination });
        },
        clickPoint(ev),
      );
      document.getElementById('wt-browse')?.addEventListener('click', () => {
        const loc = (document.getElementById('wt-loc') as HTMLInputElement).value;
        post({ type: 'pickFolder', requestId: rid, defaultPath: loc });
      });
      syncWorktreeForm();
      const nameInput = document.getElementById('wt-name') as HTMLInputElement | null;
      nameInput?.focus();
      nameInput?.select();
    }
    if (id === 'c-rw') gitDialog(t('Reword'), `<textarea id="msg">${esc(c.subject)}</textarea>`, () => act({ kind: 'reword', hash: c.hash, message: (document.getElementById('msg') as HTMLTextAreaElement).value }), clickPoint(ev));
    if (id === 'c-am') openAmendDialog(c);
  }
  if (state.ctxFile && state.details) {
    if (id === 'f-diff') postDiff(state.ctxFile);
    if (id === 'f-open') post({ type: 'openWorkFile', path: state.ctxFile.path });
    if (id === 'f-blob') {
      const hash = state.ctxFile.rev || (state.details.hash === UNCOMMITTED ? 'HEAD' : state.details.hash);
      post({ type: 'showBlob', hash, path: state.ctxFile.path });
    }
    if (id === 'f-history') post({ type: 'setHistoryPath', path: state.ctxFile.path });
    if (id === 'f-blame') post({ type: 'blame', path: state.ctxFile.path });
    if (id === 'f-copy') {
      post({ type: 'copy', text: state.ctxFile.path });
      showCopiedToast((ev as MouseEvent).clientX, (ev as MouseEvent).clientY);
    }
    if (id === 'f-copy-full') {
      post({ type: 'copy', text: joinRepoPath(state.ctxFile.path) });
      showCopiedToast((ev as MouseEvent).clientX, (ev as MouseEvent).clientY);
    }
    if (id === 'f-stash') stashSelected(state.ctxFiles, clickPoint(ev));
    if (id === 'f-patch') void saveFilePatch(state.ctxFiles);
  }
}

export function showCtrlSelection(hashes: string[]): void {
  state.commitRange = hashes;
  if (hashes.length >= 3) {
    state.selected = null;
    clearCompare();
    state.details = null;
    post({ type: 'openRow', hash: null });
  } else if (hashes.length === 2) {
    state.selected = hashes[0]!;
    state.compare = hashes[1]!;
    state.compareAnchor = undefined;
    state.compareLeftName = undefined;
    state.compareRightName = undefined;
    post({ type: 'compare', a: hashes[0]!, b: hashes[1]! });
  } else if (hashes.length === 1) {
    state.selected = hashes[0]!;
    clearCompare();
    post({ type: 'openRow', hash: state.selected });
  } else {
    state.selected = null;
    clearCompare();
    state.details = null;
    post({ type: 'openRow', hash: null });
  }
  persistView();
  paint();
}
