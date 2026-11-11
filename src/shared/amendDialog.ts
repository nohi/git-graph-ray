import { t } from '@vscode/l10n';
import { escapeAttr, escapeHtml } from './issueLinks';

export function amendDialogHtml(opts: { subject: string; body: string; includeStaged: boolean }): string {
  return (
    `<label class="dlg-field">${t('Subject')} <input id="am-subject" autocomplete="off" value="${escapeAttr(opts.subject)}" /></label>` +
    `<label class="dlg-field">${t('Message')} <textarea id="am-body" rows="4">${escapeHtml(opts.body)}</textarea></label>` +
    `<label><input type="checkbox" id="am-staged"${opts.includeStaged ? ' checked' : ''}/> ${t('Include staged changes')}</label>`
  );
}
