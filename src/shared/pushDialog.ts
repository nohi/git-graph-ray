import { escapeAttr, escapeHtml } from './issueLinks';
import type { PushMode } from './protocol';

const FORCE_WARN =
  '<svg class="dlg-warn-ic" viewBox="0 0 16 16" aria-hidden="true" title="Warning"><path fill="currentColor" d="M8.89 1.5a1 1 0 0 0-1.78 0l-6.5 12A1 1 0 0 0 1.5 15h13a1 1 0 0 0 .89-1.5zm-.14 3.7c.4 0 .7.32.7.72v3.36a.7.7 0 0 1-1.4 0V5.92c0-.4.31-.72.7-.72zM8 12.4a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8z"/></svg>';

export function preferredPushRemote(remotes: string[]): string | undefined {
  if (remotes.includes('origin')) return 'origin';
  return remotes[0];
}

export function parsePushMode(value: string | null | undefined): PushMode {
  return value === 'force' || value === 'force-with-lease' ? value : 'normal';
}

export function pushBranchDialogHtml(remotes: string[]): string {
  const preferred = preferredPushRemote(remotes);
  const remoteField =
    remotes.length > 1
      ? `<fieldset class="dlg-stack"><legend>Remote</legend>${remotes
          .map(
            (name) =>
              `<label><input type="checkbox" name="rm" value="${escapeAttr(name)}"${name === preferred ? ' checked' : ''}/> ${escapeHtml(name)}</label>`,
          )
          .join('')}</fieldset>`
      : `<label class="dlg-field">Remote <select id="rm">${
          remotes.length
            ? remotes
                .map((name) => `<option value="${escapeAttr(name)}" selected>${escapeHtml(name)}</option>`)
                .join('')
            : '<option value="" disabled selected>No remotes</option>'
        }</select></label>`;
  return `${remoteField}
    <label><input type="checkbox" id="su" checked /> set-upstream</label>
    <fieldset class="dlg-stack">
      <legend>Push method</legend>
      <label><input type="radio" name="pm" value="normal" checked /> normal</label>
      <label><input type="radio" name="pm" value="force-with-lease" /> force-with-lease</label>
      <label class="dlg-force" title="Warning: overwrites remote history"><input type="radio" name="pm" value="force" /> force ${FORCE_WARN}</label>
    </fieldset>`;
}
