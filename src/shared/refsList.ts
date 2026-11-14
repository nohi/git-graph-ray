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

export type RepoChoice = { path: string; name: string; current: boolean };

/**
 * One choice per repository for the repository picker. Names are disambiguated
 * like worktree labels so same-named folders stay distinguishable.
 */
export function repoChoices(repos: Array<{ path: string; name: string }>, currentPath: string): RepoChoice[] {
  const names = worktreeDisplayNames(repos.map((r) => r.path));
  return repos.map((r, i) => ({ path: r.path, name: names[i] ?? r.name, current: r.path === currentPath }));
}

/**
 * Display names for worktree paths. A folder name shared by several worktrees
 * grows parent segments until every name is unique (`foo` → `buz/foo`).
 * Comparison is case-insensitive; the returned names keep their original case.
 */
export function worktreeDisplayNames(paths: string[]): string[] {
  const split = paths.map((p) =>
    p
      .replace(/\\/g, '/')
      .replace(/\/+$/, '')
      .split('/')
      .filter((s) => s.length > 0),
  );
  const depth = split.map(() => 1);
  const current = () => split.map((parts, i) => parts.slice(-depth[i]).join('/') || paths[i]!);
  for (;;) {
    const names = current();
    const counts = new Map<string, number>();
    for (const n of names) counts.set(n.toLowerCase(), (counts.get(n.toLowerCase()) ?? 0) + 1);
    let grown = false;
    for (let i = 0; i < names.length; i++) {
      if ((counts.get(names[i]!.toLowerCase()) ?? 0) > 1 && depth[i]! < split[i]!.length) {
        depth[i]! += 1;
        grown = true;
      }
    }
    if (!grown) return names;
  }
}

export type RemoteBranchPrefix = 'icon' | 'text';

/** Graph text for a remote-tracking branch. Icon mode drops the `remotes/` prefix; the cloud is drawn before this text. */
export function remoteChipText(name: string, prefix: RemoteBranchPrefix): string {
  const rest = name.startsWith('remotes/') ? name.slice('remotes/'.length) : name;
  return prefix === 'icon' ? rest : `remotes/${rest}`;
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

function sameListedRef(a: GraphRef, b: GraphRef): boolean {
  if (a.kind !== b.kind || a.name !== b.name) return false;
  if (a.kind === 'worktree') return (a.worktreePath ?? a.name) === (b.worktreePath ?? b.name);
  return true;
}

/**
 * Commit to scroll to from a Branches/Tags row.
 * Glob patterns do not point at one commit.
 * Annotated tags appear twice in the catalog (tag object, then the peeled commit).
 * A hash that is already loaded wins; otherwise the last hash is the commit.
 */
export function refJumpHash(ref: GraphRef, catalog: readonly GraphRef[], loaded: ReadonlySet<string>): string | null {
  if (ref.name.startsWith('glob:')) return null;
  const hashes: string[] = [];
  const add = (hash: string) => {
    if (hash && !hashes.includes(hash)) hashes.push(hash);
  };
  for (const other of catalog) {
    if (sameListedRef(other, ref)) add(other.hash);
  }
  add(ref.hash);
  for (const hash of hashes) {
    if (loaded.has(hash)) return hash;
  }
  return hashes.at(-1) ?? null;
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

/**
 * When a branch filter is active, drop local and remote branches that point at
 * the same commit as a checked ref but were not checked themselves.
 * Tags, stashes, worktrees, and detached HEAD stay on that commit.
 * Showing every ref, or leaving the option on, keeps the full list.
 */
export function branchLabelsForFilter(
  refs: GraphRef[],
  selected: readonly string[] | 'all',
  showUnselectedOnSameCommit: boolean,
): GraphRef[] {
  if (showUnselectedOnSameCommit || selected === 'all') return refs;
  const picked = new Set(selected);
  const selectedHashes = new Set<string>();
  for (const ref of refs) {
    if (picked.has(refLogArg(ref))) selectedHashes.add(ref.hash);
  }
  if (selectedHashes.size === 0) return refs;
  return refs.filter((ref) => {
    if (ref.kind !== 'head' && ref.kind !== 'remote') return true;
    if (ref.kind === 'head' && ref.name === 'HEAD') return true;
    if (picked.has(refLogArg(ref))) return true;
    return !selectedHashes.has(ref.hash);
  });
}

/** The local branch that is checked out. A shorter name on the same commit does not match. */
export function isCheckedOutBranch(ref: { kind: string; name: string }, currentBranch: string | null | undefined): boolean {
  return ref.kind === 'head' && Boolean(currentBranch) && ref.name === currentBranch;
}

/**
 * Cache key for the labels on one commit.
 * Checking out another local branch on that commit does not change the ref list.
 */
export function commitLabelKey(
  currentBranch: string | null | undefined,
  refs: readonly { kind: string; name: string; hash: string }[],
): string {
  const listed = refs.map((ref) => `${ref.kind}:${ref.name}:${ref.hash}`).join(',');
  return `${currentBranch ?? ''}\u001f${listed}`;
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
