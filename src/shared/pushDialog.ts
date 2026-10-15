import { escapeAttr, escapeHtml } from './issueLinks';
import type { PushMode } from './protocol';
import type { TagOnRemote } from './remoteTags';

const WARN_PATH =
  'M8.89 1.5a1 1 0 0 0-1.78 0l-6.5 12A1 1 0 0 0 1.5 15h13a1 1 0 0 0 .89-1.5zm-.14 3.7c.4 0 .7.32.7.72v3.36a.7.7 0 0 1-1.4 0V5.92c0-.4.31-.72.7-.72zM8 12.4a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8z';

function warnIcon(title: string): string {
  return `<svg class="dlg-warn-ic" viewBox="0 0 16 16" aria-hidden="true" title="${escapeAttr(title)}"><path fill="currentColor" d="${WARN_PATH}"/></svg>`;
}

const FORCE_WARN = warnIcon('Warning');

const PUSHED_ICON =
  '<svg class="dlg-ok-ic" viewBox="0 0 16 16" aria-hidden="true" title="Already on this remote"><path fill="currentColor" d="M14.43 3.32 5.96 13.32l-1.17-1.16-4.72-4.72 1.17-1.16 3.55 3.55 7.3-8.63z"/></svg>';

export function tagOnRemoteIcon(mark: TagOnRemote | null): string {
  if (mark === 'pushed') return PUSHED_ICON;
  if (mark === 'mismatch') return warnIcon('Points at a different commit on this remote');
  return '';
}

export function tagRemoteLoadingIcon(): string {
  return '<svg class="dlg-tag-spin" viewBox="0 0 16 16" aria-hidden="true" title="Checking this remote"><path fill="currentColor" d="M8 1.5a6.5 6.5 0 1 0 6.5 6.5h-1.5A5 5 0 1 1 8 3z"/></svg>';
}

export function preferredPushRemote(remotes: string[]): string | undefined {
  if (remotes.includes('origin')) return 'origin';
  return remotes[0];
}

export function parsePushMode(value: string | null | undefined): PushMode {
  return value === 'force' || value === 'force-with-lease' ? value : 'normal';
}

export function pushRemoteFieldHtml(remotes: string[], tagMarks = false): string {
  const preferred = preferredPushRemote(remotes);
  const mark = (name: string) => (tagMarks ? `<span class="dlg-tag-mark" data-tag-mark="${escapeAttr(name)}"></span>` : '');
  if (remotes.length > 1) {
    return `<fieldset class="dlg-stack"><legend>Remote</legend>${remotes
      .map(
        (name) =>
          `<label><input type="checkbox" name="rm" value="${escapeAttr(name)}"${name === preferred ? ' checked' : ''}/> ${escapeHtml(name)}${mark(name)}</label>`,
      )
      .join('')}</fieldset>`;
  }
  const select = `<select id="rm">${
    remotes.length
      ? remotes.map((name) => `<option value="${escapeAttr(name)}" selected>${escapeHtml(name)}</option>`).join('')
      : '<option value="" disabled selected>No remotes</option>'
  }</select>`;
  if (!tagMarks) return `<label class="dlg-field">Remote ${select}</label>`;
  return `<label class="dlg-field">Remote <span class="dlg-remote-row">${select}<span class="dlg-tag-mark" id="rm-mark"></span></span></label>`;
}

export function pushTagDialogHtml(remotes: string[]): string {
  return `${pushRemoteFieldHtml(remotes, true)}${remoteTagErrorHtml()}`;
}

function remoteTagErrorHtml(): string {
  return '<p id="tag-remote-err" class="dlg-warn" hidden></p>';
}

/** Checkboxes stay unchecked unless `pushToRemote` pre-selects the preferred remote. */
export function addTagDialogHtml(remotes: string[], opts: { annotated: boolean; pushToRemote: boolean }): string {
  const annotated = `<label><input type="checkbox" id="an"${opts.annotated ? ' checked' : ''}/> annotated</label>`;
  return `<input id="tn" />${annotated}${optionalPushRemotesHtml(remotes, opts.pushToRemote)}${remoteTagErrorHtml()}`;
}

function optionalPushRemotesHtml(remotes: string[], preselect: boolean): string {
  if (!remotes.length) return '';
  const preferred = preselect ? preferredPushRemote(remotes) : undefined;
  const boxes = remotes
    .map(
      (name) =>
        `<label><input type="checkbox" name="rm" value="${escapeAttr(name)}"${name === preferred ? ' checked' : ''}/> ${escapeHtml(name)}<span class="dlg-tag-mark" data-tag-mark="${escapeAttr(name)}"></span></label>`,
    )
    .join('');
  return `<fieldset class="dlg-stack" data-push-optional><legend>Push to</legend>${boxes}</fieldset>`;
}

export function pushBranchDialogHtml(remotes: string[]): string {
  return `${pushRemoteFieldHtml(remotes)}
    <label><input type="checkbox" id="su" checked /> set-upstream</label>
    <fieldset class="dlg-stack">
      <legend>Push method</legend>
      <label><input type="radio" name="pm" value="normal" checked /> normal</label>
      <label><input type="radio" name="pm" value="force-with-lease" /> force-with-lease</label>
      <label class="dlg-force" title="Warning: overwrites remote history"><input type="radio" name="pm" value="force" /> force ${FORCE_WARN}</label>
    </fieldset>`;
}
