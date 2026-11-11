import { t } from '@vscode/l10n';
import { UNCOMMITTED, type CommitDetails } from './types';

export type MetaCopyIcon = 'copy' | 'mail' | 'person' | 'contact';

export type MetaCopy = { label: string; text: string; title: string; icon?: MetaCopyIcon };

export type DetailsMetaRow = {
  label: string;
  value: string;
  hashLink?: string;
  copies: MetaCopy[];
};

export function personIdentity(name: string, email: string): string {
  if (name && email) return `${name} <${email}>`;
  return name || (email ? `<${email}>` : '');
}

export function hashCopies(hash: string): MetaCopy[] {
  return [
    { label: '8', text: hash.slice(0, 8), title: t('Copy 8 characters') },
    { label: 'F', text: hash, title: t('Copy full hash') },
  ];
}

export function personCopies(name: string, email: string): MetaCopy[] {
  const copies: MetaCopy[] = [];
  const full = personIdentity(name, email);
  if (full) copies.push({ label: '', text: full, title: t('Copy name and email'), icon: 'contact' });
  if (name) copies.push({ label: '', text: name, title: t('Copy name'), icon: 'person' });
  if (email) copies.push({ label: '', text: email, title: t('Copy email'), icon: 'mail' });
  return copies;
}

export function detailsMetaRows(
  d: Pick<
    CommitDetails,
    | 'hash'
    | 'parents'
    | 'authorName'
    | 'authorEmail'
    | 'committerName'
    | 'committerEmail'
    | 'compareSplit'
  >,
  dates: { author: string; committer: string },
): DetailsMetaRow[] {
  const rows: DetailsMetaRow[] = [];
  if (d.hash && d.hash !== UNCOMMITTED) {
    rows.push({ label: t('Commit'), value: d.hash, copies: hashCopies(d.hash) });
  }
  d.parents.filter(Boolean).forEach((p, i) => {
    rows.push({
      label: i === 0 ? t('Parents') : '',
      value: p,
      hashLink: p,
      copies: hashCopies(p),
    });
  });
  if (d.compareSplit?.base) {
    rows.push({
      label: t('Common parent'),
      value: d.compareSplit.base,
      hashLink: d.compareSplit.base,
      copies: hashCopies(d.compareSplit.base),
    });
  }
  const author = personIdentity(d.authorName, d.authorEmail);
  if (author) {
    rows.push({ label: t('Author'), value: author, copies: personCopies(d.authorName, d.authorEmail) });
  }
  if (dates.author) {
    rows.push({ label: t('Author Date'), value: dates.author, copies: [{ label: '', text: dates.author, title: t('Copy') }] });
  }
  const committer = personIdentity(d.committerName, d.committerEmail);
  if (committer) {
    rows.push({
      label: t('Committer'),
      value: committer,
      copies: personCopies(d.committerName, d.committerEmail),
    });
  }
  if (dates.committer) {
    rows.push({
      label: t('Committer Date'),
      value: dates.committer,
      copies: [{ label: '', text: dates.committer, title: t('Copy') }],
    });
  }
  return rows;
}

export function commitMessageText(d: { subject: string; body: string; compare?: string }): string {
  if (d.compare) return d.subject;
  const subject = d.subject.replace(/\s+$/, '');
  const body = d.body.replace(/^\n+/, '').replace(/\s+$/, '');
  if (!body) return subject;
  if (body === subject || body.startsWith(`${subject}\n`)) return body;
  return `${subject}\n\n${body}`;
}
