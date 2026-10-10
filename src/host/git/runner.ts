import { spawn } from 'node:child_process';

let extraEnv: NodeJS.ProcessEnv = {};
let writeGitLog: (line: string) => void = () => {};

export function setGitCommandLogger(write: (line: string) => void): void {
  writeGitLog = write;
}

/** Bare words a terminal accepts without quotes. Anything else is wrapped in `"`. */
const SAFE_GIT_ARG = /^[A-Za-z0-9._@+=:,/~-]+$/;

/**
 * Command line that can be copied into a terminal.
 * `> git <args> [Nms]`, with values that need it wrapped in double quotes.
 */
export function formatGitCommandLog(args: readonly string[], durationMs: number): string {
  return `> git ${args.map(quoteGitArg).join(' ')} [${durationMs}ms]`;
}

function quoteGitArg(arg: string): string {
  const eq = arg.startsWith('--') ? arg.indexOf('=') : -1;
  if (eq > 2 && SAFE_GIT_ARG.test(arg.slice(0, eq))) {
    return `${arg.slice(0, eq)}=${quoteGitValue(arg.slice(eq + 1))}`;
  }
  return quoteGitValue(arg);
}

function quoteGitValue(value: string): string {
  if (value.length > 0 && SAFE_GIT_ARG.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

/** Stderr body Git appends after the command line, without trailing blank lines. */
export function formatGitStderrLog(stderr: string): string | undefined {
  const lines = stderr.split(/\r?\n/);
  while (lines.length > 0 && /^\s*$/.test(lines[lines.length - 1] ?? '')) lines.pop();
  if (lines.length === 0) return undefined;
  return lines.join('\n');
}

function emitGitCommandLog(args: readonly string[], started: number, stderr: string): void {
  try {
    writeGitLog(formatGitCommandLog(args, Date.now() - started));
    const detail = formatGitStderrLog(stderr);
    if (detail !== undefined) writeGitLog(detail);
  } catch {
    /* a closed output channel must not fail the git call */
  }
}

export function setGitExtraEnv(env: NodeJS.ProcessEnv): void {
  extraEnv = env;
}

export function gitEnv(): NodeJS.ProcessEnv {
  return { ...process.env, ...extraEnv, GIT_OPTIONAL_LOCKS: '0' };
}

export async function gitExec(
  git: string,
  cwd: string,
  args: string[],
  opts?: { encoding?: string; extraEnv?: NodeJS.ProcessEnv; stdin?: string | Buffer },
): Promise<{ code: number; stdout: Buffer; stderr: string }> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(git, args, { cwd, env: { ...gitEnv(), ...opts?.extraEnv, GIT_OPTIONAL_LOCKS: '0' }, windowsHide: true });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let settled = false;
    const stderrText = () => Buffer.concat(err).toString('utf8');
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      emitGitCommandLog(args, started, stderrText());
      settle();
    };
    child.stdout.on('data', (c) => out.push(c as Buffer));
    child.stderr.on('data', (c) => err.push(c as Buffer));
    child.stdin.on('error', () => {
      /* git may exit before it finishes reading stdin */
    });
    if (opts?.stdin != null) child.stdin.end(opts.stdin);
    child.on('error', (error) => finish(() => reject(error)));
    child.on('close', (code) =>
      finish(() =>
        resolve({
          code: code ?? 1,
          stdout: Buffer.concat(out),
          stderr: stderrText(),
        }),
      ),
    );
    void opts?.encoding;
  });
}

export async function gitOk(git: string, cwd: string, args: string[], extraEnv?: NodeJS.ProcessEnv): Promise<string> {
  const r = await gitExec(git, cwd, args, extraEnv ? { extraEnv } : undefined);
  if (r.code !== 0) throw new Error(r.stderr.trim() || `git ${args.join(' ')} failed`);
  return r.stdout.toString('utf8');
}

export async function gitMaybe(git: string, cwd: string, args: string[]): Promise<string> {
  const r = await gitExec(git, cwd, args);
  return r.stdout.toString('utf8');
}
