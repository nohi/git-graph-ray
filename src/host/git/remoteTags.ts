import { RemoteTagCache, remoteTagCacheKey, resolveRemoteTagTips, type RemoteTagQuery } from '../../shared/remoteTagCache';
import type { RemoteTagLookup } from '../../shared/remoteTags';
import { parseRemoteTagTips } from '../../shared/remoteTags';
import { gitExec } from './runner';

const cache = new RemoteTagCache();

export function invalidateRemoteTagCache(repo: string, remotes: string[]): void {
  for (const remote of remotes) cache.invalidate(remoteTagCacheKey(repo, remote));
}

export function loadRemoteTagTips(git: string, cwd: string, remotes: string[], ttlMs: number): Promise<RemoteTagLookup> {
  return resolveRemoteTagTips(cwd, remotes, ttlMs, Date.now(), cache, (remote) => queryRemoteTags(git, cwd, remote));
}

export function listRemoteTagTips(git: string, cwd: string, remotes: string[]): Promise<RemoteTagLookup> {
  return resolveRemoteTagTips(cwd, remotes, 0, Date.now(), cache, (remote) => queryRemoteTags(git, cwd, remote));
}

async function queryRemoteTags(git: string, cwd: string, remote: string): Promise<RemoteTagQuery> {
  try {
    const result = await gitExec(git, cwd, ['ls-remote', '--tags', remote], {
      extraEnv: { GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '', SSH_ASKPASS: '', GCM_INTERACTIVE: 'Never' },
    });
    if (result.code !== 0) {
      return { tags: [], error: { remote, message: result.stderr.trim() || `git ls-remote --tags ${remote} failed` } };
    }
    return { tags: parseRemoteTagTips(remote, result.stdout.toString('utf8')), error: null };
  } catch (error) {
    return { tags: [], error: { remote, message: error instanceof Error ? error.message : String(error) } };
  }
}
