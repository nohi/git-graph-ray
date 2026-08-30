import { spawn } from 'node:child_process';

let extraEnv: NodeJS.ProcessEnv = {};

export function setGitExtraEnv(env: NodeJS.ProcessEnv): void {
  extraEnv = env;
}

export function gitEnv(): NodeJS.ProcessEnv {
  return { ...process.env, ...extraEnv };
}

export async function gitExec(
  git: string,
  cwd: string,
  args: string[],
  opts?: { encoding?: string; extraEnv?: NodeJS.ProcessEnv },
): Promise<{ code: number; stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(git, args, { cwd, env: { ...gitEnv(), ...opts?.extraEnv }, windowsHide: true });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on('data', (c) => out.push(c as Buffer));
    child.stderr.on('data', (c) => err.push(c as Buffer));
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(out),
        stderr: Buffer.concat(err).toString('utf8'),
      });
    });
    void opts;
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
