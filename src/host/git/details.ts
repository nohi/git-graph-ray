import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { buildCommitSignature } from '../../shared/signature';
import { UNCOMMITTED, type CommitDetails, type FileChange } from '../../shared/types';
import { gitExec, gitOk } from './runner';
import { signatureFromCommit, type CommitObjectSignature } from './signature';

export type LineCounts = { additions: number; deletions: number };

export async function loadDetails(
  git: string,
  cwd: string,
  hash: string,
  compare?: string,
  encoding = 'utf8',
): Promise<CommitDetails> {
  if (hash === UNCOMMITTED && !compare) return uncommittedDetails(git, cwd, encoding);
  if (compare) return compareDetails(git, cwd, hash, compare, encoding);

  const format =
    '%H%x1f%P%x1f%aN%x1f%aE%x1f%at%x1f%cN%x1f%cE%x1f%ct%x1f%s%x1f%b%x1f%G?%x1f%GS%x1f%GK%x1f%GF%x1f%GP%x1f%GT';
  const raw = decode(await gitOkBytes(git, cwd, ['show', '-s', `--format=${format}`, hash]), encoding);
  const parts = raw.split('\x1f');
  const files = await loadFiles(git, cwd, hash);
  const embedded = await readCommitSignature(git, cwd, hash);
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
    signature: buildCommitSignature({
      kind: embedded.kind,
      grade: parts[10],
      signer: parts[11],
      key: parts[12],
      fingerprint: parts[13]?.trim() || embedded.fingerprint,
      primary: parts[14],
      trust: parts[15],
      keyAlgorithm: embedded.keyAlgorithm,
      hashAlgorithm: embedded.hashAlgorithm,
      namespace: embedded.namespace,
      signedAt: embedded.signedAt,
      signatureExpires: embedded.signatureExpires,
      keyExpires: embedded.keyExpires,
    }),
  };
}

async function readCommitSignature(git: string, cwd: string, hash: string): Promise<CommitObjectSignature> {
  try {
    const result = await gitExec(git, cwd, ['cat-file', 'commit', hash]);
    if (result.code !== 0) return { kind: null };
    return signatureFromCommit(result.stdout);
  } catch {
    return { kind: null };
  }
}

async function compareDetails(git: string, cwd: string, a: string, b: string, encoding: string): Promise<CommitDetails> {
  const left = a === UNCOMMITTED ? 'HEAD' : a;
  const right = b === UNCOMMITTED ? 'HEAD' : b;
  const files = await filesFromDiff(git, cwd, ['diff', '--name-status', '-M', left, right]);
  const da = await loadDetails(git, cwd, a === UNCOMMITTED ? 'HEAD' : a, undefined, encoding);
  return {
    ...da,
    hash: a,
    compare: b,
    files,
    subject: `Compare ${short(a)} ↔ ${short(b)}`,
    signature: a === UNCOMMITTED ? { kind: null } : da.signature,
  };
}

async function uncommittedDetails(git: string, cwd: string, encoding: string): Promise<CommitDetails> {
  const files = await filesFromDiff(git, cwd, ['diff', '--name-status', '-M', 'HEAD']);
  const untracked = await gitOk(git, cwd, ['ls-files', '--others', '--exclude-standard']);
  const extras = await Promise.all(
    untracked
      .split(/\r?\n/)
      .filter(Boolean)
      .map(async (raw) => {
        const filePath = unquoteGitPath(raw);
        const file: FileChange = { path: filePath, status: 'U' };
        const additions = await countWorktreeLines(cwd, filePath);
        if (additions != null) {
          file.additions = additions;
          file.deletions = 0;
        }
        return file;
      }),
  );
  files.push(...extras);
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
    signature: { kind: null },
  };
}

async function loadFiles(git: string, cwd: string, hash: string): Promise<FileChange[]> {
  return filesFromDiff(git, cwd, ['show', '--format=', '--name-status', '-M', '--first-parent', hash]);
}

async function filesFromDiff(git: string, cwd: string, args: string[]): Promise<FileChange[]> {
  const numArgs = args.map((arg) => (arg === '--name-status' ? '--numstat' : arg));
  const [status, num] = await Promise.all([gitOk(git, cwd, args), gitOk(git, cwd, numArgs).catch(() => '')]);
  return mergeNumstat(parseNameStatus(status), parseNumstat(num));
}

export function parseNameStatus(stdout: string): FileChange[] {
  const files: FileChange[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line) continue;
    const parts = line.split('\t');
    const st = (parts[0] ?? 'M')[0] as FileChange['status'];
    if (parts.length >= 3) files.push({ status: st, oldPath: unquoteGitPath(parts[1] ?? ''), path: unquoteGitPath(parts[2] ?? '') });
    else files.push({ status: st === 'A' || st === 'M' || st === 'D' || st === 'R' || st === 'U' ? st : 'M', path: unquoteGitPath(parts[1] ?? parts[0]!) });
  }
  return files;
}

/** Destination path of a `--numstat` rename (`old => new` or `dir/{old => new}/file`). */
export function numstatDestination(file: string): string {
  const text = unquoteGitPath(file);
  const brace = /^(.*)\{(.*?) => (.*?)\}(.*)$/.exec(text);
  if (brace) return `${brace[1] ?? ''}${brace[3] ?? ''}${brace[4] ?? ''}`;
  const arrow = text.lastIndexOf(' => ');
  if (arrow >= 0) return text.slice(arrow + 4);
  return text;
}

export function parseNumstat(stdout: string): Map<string, LineCounts> {
  const stats = new Map<string, LineCounts>();
  for (const line of stdout.split(/\r?\n/)) {
    if (!line) continue;
    const match = /^(-|\d+)\t(-|\d+)\t([\s\S]+)$/.exec(line);
    if (!match) continue;
    const addRaw = match[1]!;
    const delRaw = match[2]!;
    if (addRaw === '-' || delRaw === '-') continue;
    const additions = Number(addRaw);
    const deletions = Number(delRaw);
    if (!Number.isInteger(additions) || !Number.isInteger(deletions)) continue;
    const raw = match[3]!;
    const counts = { additions, deletions };
    stats.set(numstatDestination(raw), counts);
  }
  return stats;
}

export function mergeNumstat(files: FileChange[], stats: ReadonlyMap<string, LineCounts>): FileChange[] {
  return files.map((file) => {
    const stat = stats.get(file.path);
    if (!stat) return file;
    return { ...file, additions: stat.additions, deletions: stat.deletions };
  });
}

/** Git C-quoted path (`"foo bar"`, octal bytes) back to a filesystem path. */
export function unquoteGitPath(raw: string): string {
  if (raw.length < 2 || !raw.startsWith('"') || !raw.endsWith('"')) return raw;
  const body = raw.slice(1, -1);
  const bytes: number[] = [];
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (ch !== '\\') {
      const code = body.charCodeAt(i);
      if (code > 0x7f) return raw;
      bytes.push(code);
      continue;
    }
    const next = body[++i];
    if (next === undefined) return raw;
    if (next === 'n') bytes.push(10);
    else if (next === 't') bytes.push(9);
    else if (next === 'b') bytes.push(8);
    else if (next === 'a') bytes.push(7);
    else if (next === 'v') bytes.push(11);
    else if (next === 'f') bytes.push(12);
    else if (next === 'r') bytes.push(13);
    else if (next === '\\' || next === '"') bytes.push(next.charCodeAt(0));
    else if (next >= '0' && next <= '7') {
      let oct = next;
      for (let k = 0; k < 2 && i + 1 < body.length; k++) {
        const digit = body[i + 1]!;
        if (digit < '0' || digit > '7') break;
        oct += digit;
        i++;
      }
      bytes.push(Number.parseInt(oct, 8));
    } else bytes.push(next.charCodeAt(0) & 0xff);
  }
  return Buffer.from(bytes).toString('utf8');
}

export function countTextLines(buf: Buffer): number | undefined {
  if (buf.includes(0)) return undefined;
  if (buf.length === 0) return 0;
  let lines = 0;
  for (let i = 0; i < buf.length; i++) if (buf[i] === 10) lines++;
  if (buf[buf.length - 1] !== 10) lines++;
  return lines;
}

/** Absolute path for a repo-relative git path, or undefined when it leaves the repository. */
export function resolveRepoRelative(root: string, rel: string): string | undefined {
  if (!rel) return undefined;
  const base = path.resolve(root);
  const full = path.resolve(base, rel);
  const from = path.relative(base, full);
  if (!from || from.startsWith('..') || path.isAbsolute(from)) return undefined;
  return full;
}

async function countWorktreeLines(cwd: string, rel: string): Promise<number | undefined> {
  const full = resolveRepoRelative(cwd, rel);
  if (!full) return undefined;
  try {
    const st = await fs.stat(full);
    if (!st.isFile() || st.size > 8_000_000) return undefined;
    return countTextLines(await fs.readFile(full));
  } catch {
    return undefined;
  }
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
