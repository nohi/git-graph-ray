import type { GraphRef, RefKind, RefSort } from './types';

export type FilterTab = 'branch' | 'tag' | 'worktree';

const KIND_ORDER: Record<RefKind, number> = {
  head: 0,
  remote: 1,
  tag: 2,
  stash: 3,
  worktree: 4,
};

export function uniqueRefs(refs: GraphRef[]): GraphRef[] {
  const seen = new Set<string>();
  const out: GraphRef[] = [];
  for (const r of refs) {
    const k = r.kind === 'worktree' ? `${r.kind}\0${r.worktreePath ?? r.name}` : `${r.kind}\0${r.name}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

export function refDisplayName(r: GraphRef): string {
  if (r.kind === 'remote') return r.name.startsWith('remotes/') ? r.name : `remotes/${r.name}`;
  return r.name;
}

export function refLogArg(r: GraphRef): string {
  if (r.kind === 'worktree') return r.hash;
  if (r.name.startsWith('glob:')) return r.hash;
  return r.name;
}

export function cmpRefname(a: string, b: string, sort: RefSort): number {
  const desc = sort.startsWith('-');
  const version = sort.includes('version:');
  const c = version ? a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }) : a.localeCompare(b);
  return desc ? -c : c;
}

export function filterRefsForTab(
  refs: GraphRef[],
  tab: FilterTab,
  opts: { remotes: boolean; query: string },
): GraphRef[] {
  const q = opts.query.trim().toLowerCase();
  return uniqueRefs(refs).filter((r) => {
    if (tab === 'branch') {
      if (r.kind === 'head') return true;
      if (r.kind === 'remote') return opts.remotes;
      return false;
    }
    if (tab === 'tag') return r.kind === 'tag';
    return r.kind === 'worktree';
  }).filter((r) => {
    if (!q) return true;
    return refDisplayName(r).toLowerCase().includes(q) || r.name.toLowerCase().includes(q);
  });
}

export function sortFilterRefs(refs: GraphRef[], tab: FilterTab, branchSort: RefSort, tagSort: RefSort): GraphRef[] {
  const sort = tab === 'tag' ? tagSort : branchSort;
  return [...refs].sort((a, b) => cmpRefname(refDisplayName(a), refDisplayName(b), sort));
}

export type ChipGroup =
  | { kind: 'bundle'; local: GraphRef; remotes: GraphRef[] }
  | { kind: 'single'; ref: GraphRef };

/** Combined remote labels of this many (or more) collapse to icons until expanded. */
export const REMOTE_LABEL_FOLD = 3;

export function remoteShortName(r: GraphRef): string {
  return r.remote ?? r.name.split('/')[0] ?? r.name;
}

/** Branch name of a remote-tracking ref, without the remote prefix. */
export function remoteBranchName(r: GraphRef): string | null {
  const remote = r.remote ?? r.name.split('/')[0] ?? '';
  if (!remote) return null;
  const prefix = `${remote}/`;
  if (!r.name.startsWith(prefix)) return null;
  const branch = r.name.slice(prefix.length);
  return branch || null;
}

export function remoteLabelsUseIcons(count: number, expanded: boolean): boolean {
  return count >= REMOTE_LABEL_FOLD && !expanded;
}

function refIdentity(r: GraphRef): string {
  return `${r.kind}\0${r.name}`;
}

function matchingRemotes(refs: GraphRef[], branch: string): GraphRef[] {
  const seen = new Set<string>();
  const remotes: GraphRef[] = [];
  for (const ref of refs) {
    if (ref.kind !== 'remote' || remoteBranchName(ref) !== branch) continue;
    const id = refIdentity(ref);
    if (seen.has(id)) continue;
    seen.add(id);
    remotes.push(ref);
  }
  remotes.sort((a, b) => remoteShortName(a).localeCompare(remoteShortName(b)) || a.name.localeCompare(b.name));
  return remotes;
}

export function groupChipRefs(refs: GraphRef[], combine: boolean): ChipGroup[] {
  if (!combine) return refs.map((ref) => ({ kind: 'single' as const, ref }));
  const bundles = new Map<string, GraphRef[]>();
  const consumed = new Set<string>();
  for (const local of refs) {
    if (local.kind !== 'head' || local.name === 'HEAD') continue;
    const id = refIdentity(local);
    if (bundles.has(id)) continue;
    const remotes = matchingRemotes(refs, local.name);
    if (!remotes.length) continue;
    bundles.set(id, remotes);
    for (const remote of remotes) consumed.add(refIdentity(remote));
  }
  const out: ChipGroup[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    const id = refIdentity(ref);
    if (seen.has(id) || consumed.has(id)) continue;
    seen.add(id);
    const remotes = bundles.get(id);
    if (remotes) {
      out.push({ kind: 'bundle', local: ref, remotes });
      continue;
    }
    out.push({ kind: 'single', ref });
  }
  return out;
}

export function windowRefs(refs: GraphRef[], shown: number): GraphRef[] {
  return refs.slice(0, Math.max(0, shown));
}

export function refsForFilterList(
  refs: GraphRef[],
  opts: { remotes: boolean; tags: boolean },
): GraphRef[] {
  return uniqueRefs(refs)
    .filter((r) => {
      if (r.kind === 'remote' && !opts.remotes) return false;
      if (r.kind === 'tag' && !opts.tags) return false;
      return true;
    })
    .sort((a, b) => {
      const d = (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9);
      return d || a.name.localeCompare(b.name);
    });
}
