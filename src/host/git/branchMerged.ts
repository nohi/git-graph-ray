import { gitExec } from './runner';

/**
 * Whether `git branch -d` would accept this local branch.
 * Merged into its upstream when one resolves, otherwise into HEAD.
 * Null when git could not answer.
 */
export async function branchFullyMerged(git: string, cwd: string, name: string): Promise<boolean | null> {
  const upstream = await gitExec(git, cwd, ['rev-parse', '--verify', '--quiet', `${name}@{upstream}`]);
  const upstreamHash = upstream.stdout.toString('utf8').trim();
  const target = upstream.code === 0 && upstreamHash ? upstreamHash : 'HEAD';
  const result = await gitExec(git, cwd, ['merge-base', '--is-ancestor', `refs/heads/${name}`, target]);
  if (result.code === 0) return true;
  if (result.code === 1) return false;
  return null;
}
