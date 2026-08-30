import { UNCOMMITTED, type CommitDetails, type FileChange } from '../../shared/types';
import { gitExec, gitOk } from './runner';

export async function loadDetails(
  git: string,
  cwd: string,
  hash: string,
  compare?: string,
  encoding = 'utf8',
  showSignature = false,
): Promise<CommitDetails> {
  if (hash === UNCOMMITTED && !compare) return uncommittedDetails(git, cwd, encoding);
  if (compare) return compareDetails(git, cwd, hash, compare, encoding);

  const format = showSignature
    ? '%H%x1f%P%x1f%aN%x1f%aE%x1f%at%x1f%cN%x1f%cE%x1f%ct%x1f%s%x1f%b%x1f%G?%x1f%GS'
    : '%H%x1f%P%x1f%aN%x1f%aE%x1f%at%x1f%cN%x1f%cE%x1f%ct%x1f%s%x1f%b';
  const raw = decode(await gitOkBytes(git, cwd, ['show', '-s', `--format=${format}`, hash]), encoding);
  const parts = raw.split('\x1f');
  const files = await loadFiles(git, cwd, hash);
  return {
    hash: parts[0] ?? hash,
    parents: (parts[1] ?? '').split(' ').filter(Boolean),
    authorName: parts[2] ?? '',
    authorEmail: parts[3] ?? '',
    authorDate: Number(parts[4]) || 0,
    committerName: parts[5] ?? '',
    committerEmail: parts[6] ?? '',
    committerDate: Number(parts[7]) || 0,
    subject: parts[8] ?? '',
    body: (parts[9] ?? '').trim(),
    files,
    signature: showSignature ? `${parts[10] ?? ''} ${parts[11] ?? ''}`.trim() : undefined,
  };
}

async function compareDetails(git: string, cwd: string, a: string, b: string, encoding: string): Promise<CommitDetails> {
  const left = a === UNCOMMITTED ? 'HEAD' : a;
  const right = b === UNCOMMITTED ? 'HEAD' : b;
  const files = parseNameStatus(await gitOk(git, cwd, ['diff', '--name-status', '-M', left, right]));
  const da = await loadDetails(git, cwd, a === UNCOMMITTED ? 'HEAD' : a, undefined, encoding);
  return { ...da, hash: a, compare: b, files, subject: `Compare ${short(a)} ↔ ${short(b)}` };
}

async function uncommittedDetails(git: string, cwd: string, encoding: string): Promise<CommitDetails> {
  const files = parseNameStatus(await gitOk(git, cwd, ['diff', '--name-status', '-M', 'HEAD']));
  const untracked = await gitOk(git, cwd, ['ls-files', '--others', '--exclude-standard']);
  for (const p of untracked.split(/\r?\n/).filter(Boolean)) files.push({ path: p, status: 'U' });
  void encoding;
  return {
    hash: UNCOMMITTED,
    parents: [],
    authorName: '',
    authorEmail: '',
    authorDate: 0,
    committerName: '',
    committerEmail: '',
    committerDate: 0,
    subject: 'Uncommitted changes',
    body: '',
    files,
  };
}

async function loadFiles(git: string, cwd: string, hash: string): Promise<FileChange[]> {
  const stdout = await gitOk(git, cwd, ['show', '--format=', '--name-status', '-M', '--first-parent', hash]);
  return parseNameStatus(stdout);
}

export function parseNameStatus(stdout: string): FileChange[] {
  const files: FileChange[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line) continue;
    const parts = line.split('\t');
    const st = (parts[0] ?? 'M')[0] as FileChange['status'];
    if (parts.length >= 3) files.push({ status: st, oldPath: parts[1], path: parts[2]! });
    else files.push({ status: st === 'A' || st === 'M' || st === 'D' || st === 'R' || st === 'U' ? st : 'M', path: parts[1] ?? parts[0]! });
  }
  return files;
}

async function gitOkBytes(git: string, cwd: string, args: string[]): Promise<Buffer> {
  const r = await gitExec(git, cwd, args);
  if (r.code !== 0) throw new Error(r.stderr.trim() || 'git failed');
  return r.stdout;
}

function decode(buf: Buffer, encoding: string): string {
  try {
    return new TextDecoder(encoding).decode(buf);
  } catch {
    return buf.toString('utf8');
  }
}

function short(hash: string): string {
  return hash === UNCOMMITTED ? 'worktree' : hash.slice(0, 7);
}

export async function showFile(git: string, cwd: string, spec: string, encoding: string): Promise<string> {
  const r = await gitExec(git, cwd, ['show', spec]);
  if (r.code !== 0) return '';
  return decode(r.stdout, encoding);
}
