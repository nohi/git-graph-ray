import { UNCOMMITTED, type GraphCommit, type GraphRef } from '../../shared/types';
import { logRevisionArgs, pickaxeArgs, type LogRevisionOptions } from '../../shared/gitLogArgs';
import { gitOk } from './runner';

const RS = '\u001e';
const US = '\u001f';

export async function loadCommits(options: {
  git: string;
  cwd: string;
  maxCount: number;
  skip: number;
  order: 'date' | 'author-date' | 'topo';
  showRemote: boolean;
  showStashes: boolean;
  showTags: boolean;
  firstParent: boolean;
  reflog: boolean;
  mailmap: boolean;
  branches: string[] | 'all';
  includeTagOnly: boolean;
  includeHead?: boolean;
  refs?: GraphRef[];
}): Promise<{ commits: GraphCommit[]; hasMore: boolean }> {
  const args = [
    'log',
    `--max-count=${options.maxCount + 1}`,
    `--skip=${options.skip}`,
    `--format=${RS}%H${US}%P${US}%aN${US}%aE${US}%at${US}%cN${US}%cE${US}%ct${US}%s`,
    '--no-show-signature',
  ];
  if (options.order === 'author-date') args.push('--author-date-order');
  else if (options.order === 'topo') args.push('--topo-order');
  else args.push('--date-order');
  if (options.firstParent) args.push('--first-parent');
  if (options.mailmap) args.push('--use-mailmap');
  args.push(
    ...logRevisionArgs({
      branches: options.branches,
      showRemote: options.showRemote,
      showStashes: options.showStashes,
      showTags: options.showTags,
      includeTagOnly: options.includeTagOnly,
      reflog: options.reflog,
      includeHead: Boolean(options.includeHead),
    }),
  );

  const stdout = await gitOk(options.git, options.cwd, args);
  const raw = parseLog(stdout);
  const hasMore = raw.length > options.maxCount;
  const sliced = hasMore ? raw.slice(0, options.maxCount) : raw;
  const commits = options.refs ? applyRefs(sliced, options.refs) : sliced;
  return { commits, hasMore };
}

export function parseLog(stdout: string): GraphCommit[] {
  const records = stdout.split(RS).map((part) => part.replace(/^\n/, '')).filter((part) => part.length > 0);
  const commits: GraphCommit[] = [];
  for (const record of records) {
    const parts = record.split(US);
    if (parts.length < 9) continue;
    const [hash, parents, authorName, authorEmail, authorDate, committerName, committerEmail, committerDate, subject] = parts;
    if (!hash) continue;
    commits.push({
      hash,
      parents: parents ? parents.split(' ').filter(Boolean) : [],
      authorName: authorName ?? '',
      authorEmail: authorEmail ?? '',
      authorDate: Number(authorDate) || 0,
      committerName: committerName ?? '',
      committerEmail: committerEmail ?? '',
      committerDate: Number(committerDate) || 0,
      subject: subject ?? '',
      refs: [],
    });
  }
  return commits;
}

export function applyRefs(commits: GraphCommit[], refs: GraphRef[]): GraphCommit[] {
  const map = new Map(commits.map((c) => [c.hash, { ...c, refs: [...c.refs] }]));
  for (const ref of refs) {
    const row = map.get(ref.hash);
    if (row) row.refs.push(ref);
  }
  return [...map.values()];
}

export function workingTreeDirty(porcelain: string, includeUntracked: boolean): boolean {
  for (const raw of porcelain.split(/\r?\n/)) {
    const line = raw.replace(/^\uFEFF/, '');
    if (!line) continue;
    if (line.length < 3 || (line[2] !== ' ' && line[2] !== '\t')) continue;
    if (!includeUntracked && (line.startsWith('??') || line.startsWith('!!'))) continue;
    return true;
  }
  return false;
}

export function withUncommitted(commits: GraphCommit[], head: string | null, enabled: boolean): GraphCommit[] {
  if (!enabled || !head) return commits;
  const fake: GraphCommit = {
    hash: UNCOMMITTED,
    parents: [head],
    authorName: '',
    authorEmail: '',
    authorDate: Math.floor(Date.now() / 1000),
    committerName: '',
    committerEmail: '',
    committerDate: Math.floor(Date.now() / 1000),
    subject: 'Uncommitted changes',
    refs: [],
  };
  return [fake, ...commits];
}

export async function findDiffHashes(
  git: string,
  cwd: string,
  pattern: string,
  flags: { ignoreCase: boolean; regex: boolean; maxCount: number },
  revisions: LogRevisionOptions,
): Promise<string[]> {
  if (!pattern) return [];
  const args = ['log', `--max-count=${flags.maxCount}`, '--format=%H', ...pickaxeArgs(pattern, flags.ignoreCase, flags.regex), ...logRevisionArgs(revisions)];
  const stdout = await gitOk(git, cwd, args);
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[0-9a-f]{40}$/i.test(line));
}

