import { describe, expect, it } from 'vitest';
import { gitEnv, setGitExtraEnv } from './runner';

describe('gitEnv', () => {
  it('forces GIT_OPTIONAL_LOCKS=0 so read-only git does not rewrite the index', () => {
    setGitExtraEnv({ GIT_ASKPASS: 'askpass', GIT_OPTIONAL_LOCKS: '1' });
    try {
      expect(gitEnv().GIT_OPTIONAL_LOCKS).toBe('0');
      expect(gitEnv().GIT_ASKPASS).toBe('askpass');
    } finally {
      setGitExtraEnv({});
    }
  });
});
