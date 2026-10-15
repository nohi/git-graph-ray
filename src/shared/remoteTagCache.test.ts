import { describe, expect, it } from 'vitest';
import { RemoteTagCache, remoteTagCacheKey, resolveRemoteTagTips } from './remoteTagCache';

const tip = { remote: 'origin', name: 'v1', commit: 'abc' };

describe('RemoteTagCache', () => {
  it('reuses a lookup until the ttl elapses', () => {
    const cache = new RemoteTagCache();
    const key = remoteTagCacheKey('I:\\repo\\', 'origin');
    cache.set(key, 1_000, [tip], null);
    expect(cache.get(remoteTagCacheKey('I:/repo', 'origin'), 1_000 + 299_999, 300_000)?.tags).toEqual([tip]);
    expect(cache.get(key, 1_000 + 300_000, 300_000)).toBeNull();
  });

  it('does not reuse a lookup when the ttl is zero', () => {
    const cache = new RemoteTagCache();
    const key = remoteTagCacheKey('/repo', 'origin');
    cache.set(key, 0, [tip], null);
    expect(cache.get(key, 0, 0)).toBeNull();
  });

  it('forgets an entry when that remote is invalidated', () => {
    const cache = new RemoteTagCache();
    const key = remoteTagCacheKey('/repo', 'origin');
    cache.set(key, 0, [tip], null);
    cache.invalidate(key);
    expect(cache.get(key, 1, 300_000)).toBeNull();
  });
});

describe('resolveRemoteTagTips', () => {
  it('queries each remote once and then serves the cache, including a failure', async () => {
    const cache = new RemoteTagCache();
    const seen: string[] = [];
    const query = async (remote: string) => {
      seen.push(remote);
      if (remote === 'fork') return { tags: [], error: { remote, message: 'Authentication failed' } };
      return { tags: [{ remote, name: 'v1', commit: 'abc' }], error: null };
    };
    const first = await resolveRemoteTagTips('/repo', ['origin', 'fork'], 300_000, 1_000, cache, query);
    const second = await resolveRemoteTagTips('/repo', ['origin', 'fork'], 300_000, 2_000, cache, query);
    expect(seen).toEqual(['origin', 'fork']);
    expect(second).toEqual(first);
    expect(second.errors).toEqual([{ remote: 'fork', message: 'Authentication failed' }]);
  });

  it('queries again after the ttl', async () => {
    const cache = new RemoteTagCache();
    let calls = 0;
    const query = async (remote: string) => {
      calls += 1;
      return { tags: [{ remote, name: 'v1', commit: 'abc' }], error: null };
    };
    await resolveRemoteTagTips('/repo', ['origin'], 1_000, 0, cache, query);
    await resolveRemoteTagTips('/repo', ['origin'], 1_000, 1_000, cache, query);
    expect(calls).toBe(2);
  });
});
