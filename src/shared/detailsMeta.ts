import { UNCOMMITTED, type CommitDetails } from './types';

export type MetaCopy = { label: string; text: string; title: string };

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
    { label: '8', text: hash.slice(0, 8), title: 'Copy 8 characters' },
    { label: 'full', text: hash, title: 'Copy full hash' },
  ];
}

export function personCopies(name: string, email: string): MetaCopy[] {
  const copies: MetaCopy[] = [];
  const full = personIdentity(name, email);
  if (full) copies.push({ label: 'full', text: full, title: 'Copy name and email' });
  if (name) copies.push({ label: 'name', text: name, title: 'Copy name' });
  if (email) copies.push({ label: 'email', text: email, title: 'Copy email' });
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
    | 'signature'
  >,
  dates: { author: string; committer: string },
): DetailsMetaRow[] {
  const rows: DetailsMetaRow[] = [];
  if (d.hash && d.hash !== UNCOMMITTED) {
    rows.push({ label: 'Commit', value: d.hash, copies: hashCopies(d.hash) });
  }
  d.parents.filter(Boolean).forEach((p, i) => {
    rows.push({
      label: i === 0 ? 'Parents' : '',
      value: p,
      hashLink: p,
      copies: hashCopies(p),
    });
  });
  const author = personIdentity(d.authorName, d.authorEmail);
  if (author) {
    rows.push({ label: 'Author', value: author, copies: personCopies(d.authorName, d.authorEmail) });
  }
  if (dates.author) {
    rows.push({ label: 'Author Date', value: dates.author, copies: [{ label: '', text: dates.author, title: 'Copy' }] });
  }
  const committer = personIdentity(d.committerName, d.committerEmail);
  if (committer) {
    rows.push({
      label: 'Committer',
      value: committer,
      copies: personCopies(d.committerName, d.committerEmail),
    });
  }
  if (dates.committer) {
    rows.push({
      label: 'Committer Date',
      value: dates.committer,
      copies: [{ label: '', text: dates.committer, title: 'Copy' }],
    });
  }
  if (d.signature) {
    rows.push({ label: 'Signature', value: d.signature, copies: [{ label: '', text: d.signature, title: 'Copy' }] });
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
