import { describe, expect, it } from 'vitest';
import { pushTagToRemotes } from './tagPush';

describe('pushTagToRemotes', () => {
  it('pushes each selected remote in order', async () => {
    const pushed: string[] = [];
    await pushTagToRemotes(['origin', 'upstream'], async (remote) => {
      pushed.push(remote);
    });
    expect(pushed).toEqual(['origin', 'upstream']);
  });

  it('stops on the first failed push and leaves later remotes untouched', async () => {
    const seen: string[] = [];
    await expect(
      pushTagToRemotes(['origin', 'upstream'], async (remote) => {
        seen.push(remote);
        throw new Error('rejected');
      }),
    ).rejects.toMatchObject({ pushed: false, message: 'Local tag created. rejected' });
    expect(seen).toEqual(['origin']);
  });

  it('reports remotes that already received the tag and does not continue', async () => {
    const pushed: string[] = [];
    await expect(
      pushTagToRemotes(['origin', 'upstream', 'fork'], async (remote) => {
        if (remote === 'upstream') throw new Error('no access');
        pushed.push(remote);
      }),
    ).rejects.toMatchObject({
      pushed: true,
      message: 'Local tag created and pushed to origin. no access',
    });
    expect(pushed).toEqual(['origin']);
  });
});
