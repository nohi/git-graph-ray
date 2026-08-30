import { describe, expect, it } from 'vitest';
import { UNCOMMITTED } from './types';
import { detailsMetaRows, hashCopies, personCopies, personIdentity, commitMessageText } from './detailsMeta';

describe('personIdentity', () => {
  it('formats name and email', () => {
    expect(personIdentity('Ada', 'ada@ex')).toBe('Ada <ada@ex>');
    expect(personIdentity('Ada', '')).toBe('Ada');
    expect(personIdentity('', 'ada@ex')).toBe('<ada@ex>');
  });
});

describe('hashCopies', () => {
  it('offers 8-character and full copies', () => {
    const hash = 'f4a6769abcdef1234567890';
    expect(hashCopies(hash)).toEqual([
      { label: '8', text: 'f4a6769a', title: 'Copy 8 characters' },
      { label: 'full', text: hash, title: 'Copy full hash' },
    ]);
  });
});

describe('personCopies', () => {
  it('offers full, name, and email', () => {
    expect(personCopies('Ada', 'ada@ex').map((c) => c.label)).toEqual(['full', 'name', 'email']);
  });
  it('omits empty fields', () => {
    expect(personCopies('Ada', '').map((c) => c.label)).toEqual(['full', 'name']);
  });
});

describe('detailsMetaRows', () => {
  it('shows full hashes and skips the commit message', () => {
    const rows = detailsMetaRows(
      {
        hash: 'f4a6769abcdef1234567890aaaaaaaaaaaaaaa',
        parents: ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'],
        authorName: 'Ada',
        authorEmail: 'ada@ex',
        committerName: 'Ada',
        committerEmail: 'ada@ex',
      },
      { author: '29 Aug 2026', committer: '29 Aug 2026' },
    );
    expect(rows.map((r) => r.label)).toEqual([
      'Commit',
      'Parents',
      '',
      'Author',
      'Author Date',
      'Committer',
      'Committer Date',
    ]);
    expect(rows[0]?.value).toBe('f4a6769abcdef1234567890aaaaaaaaaaaaaaa');
    expect(rows[1]?.value).toHaveLength(40);
    expect(rows[1]?.hashLink).toBe(rows[1]?.value);
    expect(rows.find((r) => r.label === 'Author')?.copies.map((c) => c.label)).toEqual(['full', 'name', 'email']);
  });

  it('omits commit and person rows for uncommitted changes', () => {
    const rows = detailsMetaRows(
      {
        hash: UNCOMMITTED,
        parents: [],
        authorName: '',
        authorEmail: '',
        committerName: '',
        committerEmail: '',
      },
      { author: '', committer: '' },
    );
    expect(rows).toEqual([]);
  });
});

describe('commitMessageText', () => {
  it('includes the subject before the body', () => {
    expect(commitMessageText({ subject: 'Fix login', body: 'Details here.\nMore.' })).toBe(
      'Fix login\n\nDetails here.\nMore.',
    );
  });
  it('does not drop a subject-only message', () => {
    expect(commitMessageText({ subject: 'Fix login', body: '' })).toBe('Fix login');
  });
  it('keeps compare titles without the original body', () => {
    expect(commitMessageText({ subject: 'Compare abc ↔ def', body: 'old body', compare: 'def' })).toBe(
      'Compare abc ↔ def',
    );
  });
});
