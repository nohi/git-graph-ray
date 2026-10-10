import { describe, expect, it } from 'vitest';
import type { GraphCommit, GraphRef } from '../../shared/types';
import { applyRefs } from './log';

function commit(hash: string): GraphCommit {
  return {
    hash,
    parents: [],
    authorName: '',
    authorEmail: '',
    authorDate: 0,
    committerName: '',
    committerEmail: '',
    committerDate: 0,
    subject: hash,
    refs: [],
  };
}

describe('applyRefs', () => {
  it('attaches branch and tag labels to commits on a later page', () => {
    const later = commit('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    const refs: GraphRef[] = [
      { kind: 'head', name: 'main', hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      { kind: 'head', name: 'old', hash: later.hash },
      { kind: 'tag', name: 'v1', hash: later.hash },
    ];
    const [row] = applyRefs([later], refs);
    expect(row?.refs.map((ref) => ref.name)).toEqual(['old', 'v1']);
  });
});
