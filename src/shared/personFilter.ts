import { UNCOMMITTED } from './types';

export type PersonField = 'author' | 'committer';

export type NamedCommit = {
  hash: string;
  authorName: string;
  authorEmail: string;
  committerName: string;
  committerEmail: string;
};

export type PersonBucket = {
  key: string;
  name: string;
  email: string;
  count: number;
};

/** Name and email pairs hidden for each column. A missing pair stays visible, including people loaded later. */
export type PersonFilter = {
  author: ReadonlySet<string>;
  committer: ReadonlySet<string>;
};

export function emptyPersonFilter(): PersonFilter {
  return { author: new Set(), committer: new Set() };
}

export function copyPersonFilter(filter: PersonFilter): { author: Set<string>; committer: Set<string> } {
  return { author: new Set(filter.author), committer: new Set(filter.committer) };
}

export function personKey(name: string, email: string): string {
  return `${name}\0${email}`;
}

/** `Name <email>` when an email is present, otherwise the name alone. */
export function personLabel(name: string, email: string): string {
  return email ? `${name} <${email}>` : name;
}

function identityOf(commit: NamedCommit | undefined, field: PersonField): { name: string; email: string } | null {
  if (!commit || commit.hash === UNCOMMITTED) return null;
  const name = field === 'author' ? commit.authorName : commit.committerName;
  if (!name.trim()) return null;
  const email = (field === 'author' ? commit.authorEmail : commit.committerEmail).trim();
  return { name, email };
}

/** People with the most commits first. Equal counts are ordered by name, then email. */
export function personBuckets(commits: NamedCommit[], field: PersonField): PersonBucket[] {
  const counts = new Map<string, PersonBucket>();
  for (const commit of commits) {
    const identity = identityOf(commit, field);
    if (!identity) continue;
    const key = personKey(identity.name, identity.email);
    const bucket = counts.get(key);
    if (bucket) bucket.count += 1;
    else counts.set(key, { key, name: identity.name, email: identity.email, count: 1 });
  }
  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name) || a.email.localeCompare(b.email),
  );
}

export function filterPeople(buckets: PersonBucket[], query: string): PersonBucket[] {
  const q = query.trim().toLowerCase();
  if (!q) return buckets;
  return buckets.filter((person) => person.name.toLowerCase().includes(q) || person.email.toLowerCase().includes(q));
}

export function hidePerson(filter: PersonFilter, field: PersonField, key: string, hidden: boolean): PersonFilter {
  const next = copyPersonFilter(filter);
  if (hidden) next[field].add(key);
  else next[field].delete(key);
  return next;
}

export function hideAllPeople(filter: PersonFilter, field: PersonField, buckets: PersonBucket[]): PersonFilter {
  const next = copyPersonFilter(filter);
  next[field].clear();
  for (const person of buckets) next[field].add(person.key);
  return next;
}

export function showAllPeople(filter: PersonFilter, field: PersonField): PersonFilter {
  const next = copyPersonFilter(filter);
  next[field].clear();
  return next;
}

export function personHidden(commit: NamedCommit, filter: PersonFilter): boolean {
  if (commit.hash === UNCOMMITTED) return false;
  const author = identityOf(commit, 'author');
  const committer = identityOf(commit, 'committer');
  return (
    (author != null && filter.author.has(personKey(author.name, author.email))) ||
    (committer != null && filter.committer.has(personKey(committer.name, committer.email)))
  );
}

/** Drop the author and committer identities of one commit so that commit is shown again. */
export function revealCommitPeople(filter: PersonFilter, commit: NamedCommit): PersonFilter {
  let next = filter;
  const author = identityOf(commit, 'author');
  const committer = identityOf(commit, 'committer');
  if (author) next = hidePerson(next, 'author', personKey(author.name, author.email), false);
  if (committer) next = hidePerson(next, 'committer', personKey(committer.name, committer.email), false);
  return next;
}
