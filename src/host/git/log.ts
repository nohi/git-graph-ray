import {
  FIND_MATCH_CAP,
  FIND_SCAN_CAP,
  assembleFindHits,
  matchFindText,
  parseFindScan,
  type FindFlags,
} from '../../shared/commitFind';
import { UNCOMMITTED, type GraphCommit, type GraphRef, type UpstreamDivergence } from '../../shared/types';
import { logRevisionArgs, messageGrepArgs, pickaxeArgs, type LogRevisionOptions } from '../../shared/gitLogArgs';
import { refDisplayName } from '../../shared/refsList';
import { gitOk } from './runner';
import { attachSignatureKinds } from './signature';

async function gitLog(git: string, cwd: string, args: string[]): Promise<string> {
  try {
    return await gitOk(git, cwd, args);
  } catch (error) {
    if (!args.includes('--follow')) throw error;
    return await gitOk(git, cwd, args.filter((arg) => arg !== '--follow'));
  }
}

const RS = '\u001e';
const US = '\u001f';
// `%xNN` is the same bytes as the raw separators, and it survives being pasted into a terminal.
const LOG_FORMAT = '%x1e%H%x1f%P%x1f%aN%x1f%aE%x1f%at%x1f%cN%x1f%cE%x1f%ct%x1f%s';

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
  refs: GraphRef[];
  path?: string;
  follow?: boolean;
}): Promise<{ commits: GraphCommit[]; hasMore: boolean }> {
  const args = [
    'log',
    `--max-count=${options.maxCount + 1}`,
    `--skip=${options.skip}`,
    `--format=${LOG_FORMAT}`,
    '--no-show-signature',
  ];
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
      path: options.path,
      follow: options.follow,
      order: options.order,
    }),
  );

  const stdout = await gitLog(options.git, options.cwd, args);
  const raw = parseLog(stdout);
  const hasMore = raw.length > options.maxCount;
  const sliced = hasMore ? raw.slice(0, options.maxCount) : raw;
  const commits = applyRefs(sliced, options.refs);
  // `%G?` verifies every commit. The column only needs the armor type, which is in the object.
  await attachSignatureKinds(options.git, options.cwd, commits).catch(() => undefined);
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

export function parseUpstreamDivergence(porcelain: string): UpstreamDivergence | null {
  const line = porcelain.split(/\r?\n/).find((item) => item.startsWith('## '));
  if (!line || !line.includes('...')) return null;
  const ahead = /ahead (\d+)/.exec(line);
  const behind = /behind (\d+)/.exec(line);
  return { ahead: ahead ? Number(ahead[1]) : 0, behind: behind ? Number(behind[1]) : 0 };
}

export function workingTreeDirty(porcelain: string, includeUntracked: boolean): boolean {
  for (const raw of porcelain.split(/\r?\n/)) {
    const line = raw.replace(/^\uFEFF/, '');
    if (!line || line.startsWith('##')) continue;
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
    signatureKind: null,
  };
  return [fake, ...commits];
}

export async function loadCommitsFromTips(options: {
  git: string;
  cwd: string;
  tips: string[];
  maxCount: number;
  order: 'date' | 'author-date' | 'topo';
  mailmap: boolean;
  firstParent: boolean;
  refs: GraphRef[];
}): Promise<GraphCommit[]> {
  const tips = [...new Set(options.tips.filter(Boolean))];
  if (!tips.length) return [];
  const args = [
    'log',
    `--max-count=${options.maxCount}`,
    `--format=${LOG_FORMAT}`,
    '--no-show-signature',
  ];
  if (options.order === 'author-date') args.push('--author-date-order');
  else if (options.order === 'topo') args.push('--topo-order');
  else args.push('--date-order');
  if (options.firstParent) args.push('--first-parent');
  if (options.mailmap) args.push('--use-mailmap');
  args.push(...tips);
  const stdout = await gitOk(options.git, options.cwd, args);
  return applyRefs(parseLog(stdout), options.refs);
}

function hashLines(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[0-9a-f]{40}$/i.test(line));
}

export async function findCommitHashes(
  git: string,
  cwd: string,
  pattern: string,
  flags: FindFlags,
  revisions: LogRevisionOptions,
  refs: GraphRef[],
): Promise<{ hashes: string[]; indexes: number[]; truncated: boolean }> {
  const rev = logRevisionArgs(revisions);
  const scan = await gitLog(git, cwd, [
    'log',
    `--max-count=${FIND_SCAN_CAP + 1}`,
    `--format=%x1e%H%x1f%aN%x1f%s`,
    '--no-show-signature',
    ...rev,
  ]);
  const scanned = parseFindScan(scan);
  let extra: string[] = [];
  try {
    const grep = await gitLog(git, cwd, [
      'log',
      `--max-count=${FIND_MATCH_CAP}`,
      '--format=%H',
      ...messageGrepArgs(pattern, flags.ignoreCase, flags.regex),
      ...rev,
    ]);
    extra = hashLines(grep);
  } catch {
    extra = [];
  }
  for (const ref of refs) {
    if (matchFindText([ref.name, refDisplayName(ref)], pattern, flags)) extra.push(ref.hash);
  }
  return assembleFindHits({ scanned, query: pattern, flags, extraHashes: extra });
}

export async function hashIndex(git: string, cwd: string, revisions: LogRevisionOptions): Promise<string[]> {
  const stdout = await gitLog(git, cwd, ['log', `--max-count=${FIND_SCAN_CAP + 1}`, '--format=%H', ...logRevisionArgs(revisions)]);
  return hashLines(stdout);
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
  const stdout = await gitLog(git, cwd, args);
  return hashLines(stdout);
}

