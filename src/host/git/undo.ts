import type { GraphCommit, GraphRef } from '../../shared/types';
import { checkpointRefs, type LocalCheckpoint, type RemoteTip, type TagPoint } from '../../shared/undo';
import { loadCommitsFromTips, workingTreeDirty } from './log';
import { gitMaybe, gitOk } from './runner';

export async function captureCheckpoint(git: string, cwd: string): Promise<LocalCheckpoint> {
  const sym = (await gitMaybe(git, cwd, ['symbolic-ref', '-q', 'HEAD'])).trim();
  const branch = sym.startsWith('refs/heads/') ? sym.slice('refs/heads/'.length) : null;
  let headHash: string | null = null;
  try {
    const raw = (await gitOk(git, cwd, ['rev-parse', '--verify', '--quiet', 'HEAD'])).trim();
    headHash = raw || null;
  } catch {
    headHash = null;
  }
  const [branchText, tagText, stashText] = await Promise.all([
    gitMaybe(git, cwd, ['for-each-ref', '--format=%(objectname)%00%(refname:short)', 'refs/heads']),
    gitMaybe(git, cwd, ['for-each-ref', '--format=%(objectname)%00%(*objectname)%00%(refname:short)', 'refs/tags']),
    gitMaybe(git, cwd, ['stash', 'list', '--format=%H%x00%gs']),
  ]);
  const branches = parsePairs(branchText)
    .map(([hash, name]) => ({ name, hash }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const tags = parseTags(tagText).sort((a, b) => a.name.localeCompare(b.name));
  const stashes = parsePairs(stashText).map(([hash, message]) => ({ hash, message }));
  return { headHash, branch, branches, tags, stashes };
}

export async function captureRemoteTips(git: string, cwd: string): Promise<RemoteTip[]> {
  const text = await gitMaybe(git, cwd, ['for-each-ref', '--format=%(objectname)%00%(refname:short)', 'refs/remotes']);
  return parsePairs(text)
    .filter(([, name]) => !name.endsWith('/HEAD'))
    .map(([hash, name]) => ({ name, hash }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function workingTreeHasTrackedChanges(git: string, cwd: string): Promise<boolean> {
  const porcelain = await gitMaybe(git, cwd, ['status', '--porcelain=v1', '-uno']);
  return workingTreeDirty(porcelain, false);
}

export async function loadCheckpointCommits(
  git: string,
  cwd: string,
  checkpoint: LocalCheckpoint,
  remoteRefs: GraphRef[],
  options: { maxCount: number; order: 'date' | 'author-date' | 'topo'; mailmap: boolean; firstParent: boolean },
): Promise<GraphCommit[]> {
  const refs = checkpointRefs(checkpoint, remoteRefs);
  return loadCommitsFromTips({
    git,
    cwd,
    tips: refs.map((ref) => ref.hash),
    maxCount: options.maxCount,
    order: options.order,
    mailmap: options.mailmap,
    firstParent: options.firstParent,
    refs,
  });
}

export async function applyRestorePlan(git: string, cwd: string, args: string[][]): Promise<void> {
  for (const cmd of args) await gitOk(git, cwd, cmd);
}

function parsePairs(stdout: string): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line) continue;
    const cut = line.indexOf('\0');
    if (cut <= 0) continue;
    const hash = line.slice(0, cut);
    const name = line.slice(cut + 1);
    if (!hash || !name) continue;
    rows.push([hash, name]);
  }
  return rows;
}

function parseTags(stdout: string): TagPoint[] {
  const tags: TagPoint[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line) continue;
    const [hash, peeled, name] = line.split('\0');
    if (!hash || !name) continue;
    tags.push({ name, hash, commit: peeled || hash });
  }
  return tags;
}
