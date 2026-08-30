import { gitMaybe } from './runner';

export async function findGit(configured?: string | string[]): Promise<string> {
  const candidates = Array.isArray(configured) ? configured : configured ? [configured] : [];
  candidates.push('git');
  for (const bin of candidates) {
    try {
      await gitMaybe(bin, process.cwd(), ['--version']);
      return bin;
    } catch {
      /* try next */
    }
  }
  return 'git';
}

export async function gitVersionString(git: string): Promise<string> {
  try {
    return (await gitMaybe(git, process.cwd(), ['--version'])).trim();
  } catch {
    return '';
  }
}
