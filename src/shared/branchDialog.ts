import { escapeHtml } from './issueLinks';

/** `body` is HTML. Escape branch names before inserting them. */
export function branchEndRowsHtml(rows: { label: string; body: string }[]): string {
  const lines = rows
    .map((row) => `<div><dt>${escapeHtml(row.label)}</dt><dd>${row.body}</dd></div>`)
    .join('');
  return `<dl class="dlg-refs">${lines}</dl>`;
}

export function branchNameHtml(name: string): string {
  return `<code>${escapeHtml(name)}</code>`;
}

function currentBranchName(name: string | null | undefined): string {
  const trimmed = name?.trim() ?? '';
  return trimmed || 'detached HEAD';
}

export function mergeDialogHtml(opts: {
  into: string | null;
  from: string;
  noCommit: boolean;
  noFastForward: boolean;
  squash: boolean;
}): string {
  const mark = (on: boolean) => (on ? ' checked' : '');
  return `${branchEndRowsHtml([
    { label: 'into', body: branchNameHtml(currentBranchName(opts.into)) },
    { label: 'from', body: branchNameHtml(opts.from) },
  ])}<label><input type="checkbox" id="nc"${mark(opts.noCommit)}/> no commit</label><label><input type="checkbox" id="nff"${mark(opts.noFastForward)}/> no ff</label><label><input type="checkbox" id="sq"${mark(opts.squash)}/> squash</label>`;
}

/** Rebase the current branch onto `onto`. Omit `interactive` to hide that checkbox. */
export function rebaseDialogHtml(opts: {
  onto: string;
  from: string | null;
  ignoreDate: boolean;
  interactive?: boolean;
}): string {
  const ignore = opts.ignoreDate ? ' checked' : '';
  const interactive =
    opts.interactive === undefined
      ? ''
      : `<label><input type="checkbox" id="ir"${opts.interactive ? ' checked' : ''}/> interactive</label>`;
  return `${branchEndRowsHtml([
    { label: 'onto', body: branchNameHtml(opts.onto) },
    { label: 'from', body: branchNameHtml(currentBranchName(opts.from)) },
  ])}<label><input type="checkbox" id="id"${ignore}/> ignore date</label>${interactive}`;
}
