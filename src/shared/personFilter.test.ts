import { describe, expect, it } from 'vitest';
import { UNCOMMITTED } from './types';
import {
  emptyPersonFilter,
  filterPeople,
  hideAllPeople,
  hidePerson,
  personBuckets,
  personHidden,
  personKey,
  personLabel,
  revealCommitPeople,
  showAllPeople,
  type NamedCommit,
} from './personFilter';

function commit(
  hash: string,
  authorName: string,
  committerName = authorName,
  authorEmail = '',
  committerEmail = authorEmail,
): NamedCommit {
  return { hash, authorName, authorEmail, committerName, committerEmail };
}

function row(name: string, email: string, count: number) {
  return { key: personKey(name, email), name, email, count };
}

describe('person filter', () => {
  const commits = [
    commit('1', 'Ada', 'Ada', 'ada@example.com'),
    commit('2', 'Ada', 'Ada', 'ada@example.com'),
    commit('3', 'Bea', 'Bea', 'bea@example.com'),
    commit('4', 'Cara', 'Cara', 'cara@example.com'),
    commit('5', 'Bea', 'Bea', 'bea@example.com'),
    commit('6', 'Bea', 'Bea', 'bea@example.com'),
  ];

  it('counts name and email pairs, skips blanks and the uncommitted row, and sorts by count then name', () => {
    const withExtra: NamedCommit[] = [
      { hash: UNCOMMITTED, authorName: 'Ada', authorEmail: 'ada@example.com', committerName: 'Ada', committerEmail: 'ada@example.com' },
      commit('blank', '  ', 'Bea', '', 'bea@example.com'),
      ...commits,
    ];
    expect(personBuckets(withExtra, 'author')).toEqual([
      row('Bea', 'bea@example.com', 3),
      row('Ada', 'ada@example.com', 2),
      row('Cara', 'cara@example.com', 1),
    ]);
    expect(personBuckets([commit('a', 'Ada', 'Bea', 'ada@example.com', 'bea@example.com'), commit('b', 'Cara', 'Ada', 'cara@example.com', 'ada@example.com')], 'committer')).toEqual([
      row('Ada', 'ada@example.com', 1),
      row('Bea', 'bea@example.com', 1),
    ]);
  });

  it('keeps two emails for one name as separate rows, name then email when the counts match', () => {
    const mixed = [
      commit('1', 'Ada', 'Ada', 'b@example.com'),
      commit('2', 'Ada', 'Ada', 'a@example.com'),
      commit('3', 'Ada', 'Ada', 'a@example.com'),
    ];
    expect(personBuckets(mixed, 'author')).toEqual([row('Ada', 'a@example.com', 2), row('Ada', 'b@example.com', 1)]);
    expect(personLabel('Ada', 'ada@example.com')).toBe('Ada <ada@example.com>');
    expect(personLabel('Ada', '')).toBe('Ada');
  });

  it('filters the list by a case-insensitive part of the name or email', () => {
    const buckets = personBuckets(commits, 'author');
    expect(filterPeople(buckets, '  AR ').map((person) => person.name)).toEqual(['Cara']);
    expect(filterPeople(buckets, 'BEA@').map((person) => person.email)).toEqual(['bea@example.com']);
    expect(filterPeople(buckets, '').map((person) => person.name)).toEqual(['Bea', 'Ada', 'Cara']);
  });

  it('hides one email and leaves the same name with another email visible', () => {
    const mixed = [commit('work', 'Ada', 'Ada', 'ada@work.example'), commit('home', 'Ada', 'Ada', 'ada@home.example')];
    const hidden = hidePerson(emptyPersonFilter(), 'author', personKey('Ada', 'ada@work.example'), true);
    expect(mixed.filter((item) => !personHidden(item, hidden)).map((item) => item.hash)).toEqual(['home']);
    expect(personHidden(commit('later', 'Dee', 'Dee', 'dee@example.com'), hidden)).toBe(false);
  });

  it('hides one name and leaves the uncommitted row and everyone else visible', () => {
    const withDirty = [{ hash: UNCOMMITTED, authorName: '', authorEmail: '', committerName: '', committerEmail: '' }, ...commits];
    const hidden = hidePerson(emptyPersonFilter(), 'author', personKey('Ada', 'ada@example.com'), true);
    const visible = withDirty.filter((item) => !personHidden(item, hidden)).map((item) => item.hash);
    expect(visible).toEqual([UNCOMMITTED, '3', '4', '5', '6']);
  });

  it('hides author identities and committer identities independently', () => {
    const mixed = [
      commit('a', 'Ada', 'Bea', 'ada@example.com', 'bea@example.com'),
      commit('b', 'Bea', 'Ada', 'bea@example.com', 'ada@example.com'),
    ];
    const hideAuthorAda = hidePerson(emptyPersonFilter(), 'author', personKey('Ada', 'ada@example.com'), true);
    expect(mixed.filter((item) => !personHidden(item, hideAuthorAda)).map((item) => item.hash)).toEqual(['b']);
    const hideCommitterAda = hidePerson(emptyPersonFilter(), 'committer', personKey('Ada', 'ada@example.com'), true);
    expect(mixed.filter((item) => !personHidden(item, hideCommitterAda)).map((item) => item.hash)).toEqual(['a']);
    const both = hidePerson(hideAuthorAda, 'committer', personKey('Ada', 'ada@example.com'), true);
    expect(mixed.filter((item) => !personHidden(item, both))).toEqual([]);
    const clearedAuthor = showAllPeople(both, 'author');
    expect(clearedAuthor.author.size).toBe(0);
    expect(clearedAuthor.committer.has(personKey('Ada', 'ada@example.com'))).toBe(true);
  });

  it('hides every listed identity on one side and keeps the other side', () => {
    const started = hidePerson(emptyPersonFilter(), 'committer', personKey('Bea', 'bea@example.com'), true);
    const hidden = hideAllPeople(started, 'author', personBuckets(commits, 'author'));
    expect([...hidden.author].sort()).toEqual(
      [personKey('Ada', 'ada@example.com'), personKey('Bea', 'bea@example.com'), personKey('Cara', 'cara@example.com')].sort(),
    );
    expect(hidden.committer.has(personKey('Bea', 'bea@example.com'))).toBe(true);
    expect(commits.filter((item) => !personHidden(item, hidden))).toEqual([]);
    expect(personHidden({ hash: UNCOMMITTED, authorName: 'Ada', authorEmail: 'ada@example.com', committerName: 'Bea', committerEmail: 'bea@example.com' }, hidden)).toBe(false);
  });

  it('shows a commit again by dropping its author and committer identities', () => {
    const hidden = hidePerson(
      hidePerson(emptyPersonFilter(), 'author', personKey('Ada', 'ada@example.com'), true),
      'committer',
      personKey('Bea', 'bea@example.com'),
      true,
    );
    const next = revealCommitPeople(hidden, commit('1', 'Ada', 'Bea', 'ada@example.com', 'bea@example.com'));
    expect(next.author.has(personKey('Ada', 'ada@example.com'))).toBe(false);
    expect(next.committer.has(personKey('Bea', 'bea@example.com'))).toBe(false);
    const kept = revealCommitPeople(hidePerson(hidden, 'author', personKey('Cara', 'cara@example.com'), true), commit('1', 'Ada', 'Bea', 'ada@example.com', 'bea@example.com'));
    expect(kept.author.has(personKey('Cara', 'cara@example.com'))).toBe(true);
  });
});
