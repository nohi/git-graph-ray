import type { RemoteTagError, RemoteTagLookup, RemoteTagTip } from './remoteTags';

export type RemoteTagCacheEntry = {
  at: number;
  tags: RemoteTagTip[];
  error: RemoteTagError | null;
};

export type RemoteTagQuery = { tags: RemoteTagTip[]; error: RemoteTagError | null };

export function remoteTagCacheKey(repo: string, remote: string): string {
  return `${repo.replaceAll('\\', '/').replace(/\/+$/, '')}\0${remote}`;
}

export class RemoteTagCache {
  private entries = new Map<string, RemoteTagCacheEntry>();

  get(key: string, now: number, ttlMs: number): RemoteTagCacheEntry | null {
    if (ttlMs <= 0) return null;
    const hit = this.entries.get(key);
    if (!hit) return null;
    if (now - hit.at >= ttlMs) {
      this.entries.delete(key);
      return null;
    }
    return hit;
  }

  set(key: string, now: number, tags: RemoteTagTip[], error: RemoteTagError | null): void {
    this.entries.set(key, { at: now, tags, error });
  }

  invalidate(key: string): void {
    this.entries.delete(key);
  }
}

export async function resolveRemoteTagTips(
  repo: string,
  remotes: string[],
  ttlMs: number,
  now: number,
  cache: RemoteTagCache,
  query: (remote: string) => Promise<RemoteTagQuery>,
): Promise<RemoteTagLookup> {
  const groups = await Promise.all(
    remotes.map(async (remote) => {
      if (!remote || remote.startsWith('-')) return { tags: [], error: null };
      const key = remoteTagCacheKey(repo, remote);
      const hit = cache.get(key, now, ttlMs);
      if (hit) return { tags: hit.tags, error: hit.error };
      const fresh = await query(remote);
      if (ttlMs > 0) cache.set(key, now, fresh.tags, fresh.error);
      return fresh;
    }),
  );
  return {
    tags: groups.flatMap((group) => group.tags),
    errors: groups.flatMap((group) => (group.error ? [group.error] : [])),
  };
}
