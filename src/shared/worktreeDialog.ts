import { escapeAttr } from './issueLinks';
import type { GraphRef } from './types';

export function isAbsolutePath(p: string): boolean {
  return p.startsWith('/') || p.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(p);
}

/** Collapse `.` and `..` and normalize separators to `/`. */
export function collapsePath(input: string): string {
  const n = input.trim().replace(/\\/g, '/');
  const unc = n.startsWith('//');
  const drive = /^[A-Za-z]:/.exec(n)?.[0] ?? '';
  const abs = unc || n.startsWith('/') || drive !== '';
  const body = drive ? n.slice(drive.length) : n;
  const out: string[] = [];
  for (const part of body.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (out.length) out.pop();
      else if (!abs) out.push('..');
      continue;
    }
    out.push(part);
  }
  const tail = out.join('/');
  if (unc) return tail ? `//${tail}` : '//';
  if (drive) return tail ? `${drive}/${tail}` : `${drive}/`;
  if (n.startsWith('/')) return `/${tail}`;
  return tail || '.';
}

export function parentDir(input: string): string {
  const n = collapsePath(input);
  if (n === '/' || n === '//' || /^[A-Za-z]:\/$/.test(n)) return n;
  const i = n.lastIndexOf('/');
  if (i < 0) return n;
  const parent = n.slice(0, i);
  if (/^[A-Za-z]:$/.test(parent)) return `${parent}/`;
  if (parent === '/' || parent === '') return '/';
  return parent;
}

export function displayPath(p: string): string {
  const n = collapsePath(p);
  if (/^[A-Za-z]:/.test(n) || n.startsWith('//')) return n.replace(/\//g, '\\');
  return n;
}

function pathKey(p: string): string {
  const n = collapsePath(p);
  if (/^[A-Za-z]:/.test(n) || n.startsWith('//')) return n.toLowerCase();
  return n;
}

function joinPath(dir: string, name: string): string {
  const base = dir.replace(/\\/g, '/').replace(/\/+$/, '');
  const child = name.trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!child) return base;
  if (!base || /^[A-Za-z]:$/.test(base)) return `${base}/${child}`;
  return `${base}/${child}`;
}

/** First non-bare worktree. Git lists the main worktree first. */
export function primaryWorktreePath(rows: Array<{ path: string; bare?: boolean }>, fallback: string): string {
  return rows.find((row) => row.path && !row.bare)?.path || fallback;
}

export function suggestedWorktreeFolder(
  refs: Pick<GraphRef, 'kind' | 'name'>[],
  hash: string,
  currentBranch?: string | null,
): string {
  const heads = refs.filter((r) => r.kind === 'head' && r.name && r.name !== 'HEAD');
  const hit = heads.find((r) => r.name === currentBranch) ?? heads[0];
  const raw = hit?.name || (hash && hash !== '*' ? `wt-${hash.slice(0, 7)}` : 'worktree');
  return raw.replace(/[<>:"|?*\\/]/g, '-');
}

/**
 * Folder that `git worktree add` will create.
 * A relative location is resolved from the parent of the main worktree, so a bare folder name lands beside it.
 * An absolute folder name is the full destination.
 */
export function worktreeDestination(location: string, folderName: string, mainWorktree: string): string {
  const folder = folderName.trim();
  if (folder && isAbsolutePath(folder)) return collapsePath(folder);
  const loc = location.trim();
  const beside = parentDir(mainWorktree);
  const base = collapsePath(loc ? (isAbsolutePath(loc) ? loc : joinPath(beside, loc)) : beside);
  if (!folder) return base;
  return collapsePath(joinPath(base, folder));
}

export function worktreeInsideMain(destination: string, mainWorktree: string): boolean {
  const dest = pathKey(destination);
  const main = pathKey(mainWorktree);
  if (!dest || !main || dest === '.' || main === '.') return false;
  if (dest === main) return true;
  const root = main.endsWith('/') ? main : `${main}/`;
  return dest.startsWith(root);
}

export function worktreeInsideWarning(mainDisplayPath: string): string {
  return `This folder is inside the main worktree (${mainDisplayPath}). Worktrees are usually created as a sibling folder next to the repository.`;
}

export type WorktreeFormState = {
  destination: string;
  insideMain: boolean;
  warning: string;
  canCreate: boolean;
};

export function worktreeFormState(location: string, folderName: string, mainWorktree: string): WorktreeFormState {
  const destination = displayPath(worktreeDestination(location, folderName, mainWorktree));
  const insideMain = worktreeInsideMain(destination, mainWorktree);
  const folder = folderName.trim();
  return {
    destination,
    insideMain,
    warning: insideMain ? worktreeInsideWarning(displayPath(mainWorktree)) : '',
    canCreate: folder.length > 0 && folder !== '.' && destination !== '' && destination !== '.',
  };
}

export function defaultWorktreeLocation(mainWorktree: string): string {
  return displayPath(parentDir(mainWorktree));
}

export function worktreeDialogHtml(opts: { location: string; name: string; requestId: string }): string {
  return `<div class="dlg-field">
      <label for="wt-loc">Create in</label>
      <span class="wt-path">
        <input data-pick="${escapeAttr(opts.requestId)}" id="wt-loc" autocomplete="off" value="${escapeAttr(opts.location)}" />
        <button type="button" id="wt-browse">Browse</button>
      </span>
    </div>
    <label class="dlg-field" for="wt-name">Folder name <input id="wt-name" autocomplete="off" value="${escapeAttr(opts.name)}" /></label>
    <p id="wt-preview" class="dlg-note"></p>
    <p id="wt-warn" class="dlg-warn" role="status" hidden></p>`;
}
