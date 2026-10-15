import type { GraphRef, RefSort } from './types';
import { cmpRefname, refDisplayName, uniqueRefs } from './refsList';

export type CompareKind = 'commit' | 'head' | 'remote' | 'tag';

export type CompareCandidate = {
  kind: CompareKind;
  /** Revision passed to `git diff`. Branch tips are hashes; tags are names. */
  rev: string;
  label: string;
  detail?: string;
};

export type CompareSection = {
  id: CompareKind;
  title: string;
  items: CompareCandidate[];
};

export type ComparePick = {
  sections: CompareSection[];
  truncated: boolean;
};

const SECTION_TITLE: Record<CompareKind, string> = {
  commit: 'Commits',
  head: 'Local branches',
  remote: 'Remote branches',
  tag: 'Tags',
};

const HASH_RE = /^[0-9a-f]{4,64}$/i;

type CommitRow = { hash: string; subject: string };

export function comparePick(opts: {
  refs: GraphRef[];
  commits: CommitRow[];
  query: string;
  limit: number;
  branchSort: RefSort;
  tagSort: RefSort;
}): ComparePick {
  const query = opts.query.trim();
  const q = query.toLowerCase();
  const budget = { left: Math.max(0, opts.limit), truncated: false };
  const sections: CompareSection[] = [];

  const commitItems = commitCandidates(opts.commits, query);
  pushSection(sections, 'commit', take(commitItems, budget));

  const locals = sortRefs(matchingRefs(opts.refs, 'head', q), opts.branchSort).map(refCandidate);
  const remotes = sortRefs(matchingRefs(opts.refs, 'remote', q), opts.branchSort).map(refCandidate);
  const tags = sortRefs(matchingRefs(opts.refs, 'tag', q), opts.tagSort).map(refCandidate);
  pushSection(sections, 'head', take(locals, budget));
  pushSection(sections, 'remote', take(remotes, budget));
  pushSection(sections, 'tag', take(tags, budget));

  return { sections, truncated: budget.truncated };
}

function commitCandidates(commits: CommitRow[], query: string): CompareCandidate[] {
  if (!HASH_RE.test(query)) return [];
  const prefix = query.toLowerCase();
  const matches = commits.filter((commit) => commit.hash.toLowerCase().startsWith(prefix));
  if (!matches.length) return [{ kind: 'commit', rev: query, label: query }];
  return matches.map((commit) => ({
    kind: 'commit',
    rev: commit.hash,
    label: commit.hash.slice(0, 7),
    ...(commit.subject ? { detail: commit.subject } : {}),
  }));
}

function matchingRefs(refs: GraphRef[], kind: 'head' | 'remote' | 'tag', q: string): GraphRef[] {
  return uniqueRefs(refs).filter((ref) => {
    if (ref.kind !== kind) return false;
    if (ref.name === 'HEAD' || ref.name.startsWith('glob:')) return false;
    if (!q) return true;
    return refDisplayName(ref).toLowerCase().includes(q) || ref.name.toLowerCase().includes(q);
  });
}

function sortRefs(refs: GraphRef[], sort: RefSort): GraphRef[] {
  return [...refs].sort((a, b) => cmpRefname(refDisplayName(a), refDisplayName(b), sort));
}

function refCandidate(ref: GraphRef): CompareCandidate {
  return {
    kind: ref.kind as CompareKind,
    rev: ref.kind === 'tag' ? ref.name : ref.hash,
    label: refDisplayName(ref),
  };
}

function pushSection(sections: CompareSection[], id: CompareKind, items: CompareCandidate[]): void {
  if (!items.length) return;
  sections.push({ id, title: SECTION_TITLE[id], items });
}

function take(items: CompareCandidate[], budget: { left: number; truncated: boolean }): CompareCandidate[] {
  if (!items.length) return [];
  if (budget.left <= 0) {
    budget.truncated = true;
    return [];
  }
  if (items.length <= budget.left) {
    budget.left -= items.length;
    return items;
  }
  budget.truncated = true;
  const out = items.slice(0, budget.left);
  budget.left = 0;
  return out;
}
