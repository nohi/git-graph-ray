import { afterEach, describe, expect, it } from 'vitest';
import { formatGitCommandLog, formatGitStderrLog, gitEnv, gitExec, setGitCommandLogger, setGitExtraEnv } from './runner';

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

describe('git command log', () => {
  afterEach(() => setGitCommandLogger(() => {}));

  it('uses the same command line as the Git extension', () => {
    expect(formatGitCommandLog(['config', '--get', 'commit.template'], 1)).toBe('> git config --get commit.template [1ms]');
    expect(formatGitCommandLog(['status', '-z', '-uall'], 12)).toBe('> git status -z -uall [12ms]');
    expect(formatGitCommandLog(['fetch'], 3181)).toBe('> git fetch [3181ms]');
  });

  it('wraps values that a terminal would not take as bare words', () => {
    const format = '--format=%x1e%H%x1f%P%x1f%aN%x1f%aE%x1f%at%x1f%cN%x1f%cE%x1f%ct%x1f%s';
    expect(formatGitCommandLog(['log', '--max-count=301', '--skip=0', format, '--glob=refs/stash'], 30)).toBe(
      '> git log --max-count=301 --skip=0 --format="%x1e%H%x1f%P%x1f%aN%x1f%aE%x1f%at%x1f%cN%x1f%cE%x1f%ct%x1f%s" --glob=refs/stash [30ms]',
    );
    expect(formatGitCommandLog(['commit', '-m', 'hello world'], 4)).toBe('> git commit -m "hello world" [4ms]');
    expect(formatGitCommandLog(['rev-parse', '--verify', '--quiet', 'topic@{upstream}'], 2)).toBe(
      '> git rev-parse --verify --quiet "topic@{upstream}" [2ms]',
    );
    expect(formatGitCommandLog(['commit', '-m', 'say "hi"'], 3)).toBe('> git commit -m "say ""hi""" [3ms]');
  });

  it('keeps stderr and drops only trailing blank lines', () => {
    expect(formatGitStderrLog('')).toBeUndefined();
    expect(formatGitStderrLog('\n')).toBeUndefined();
    expect(formatGitStderrLog('fatal: not a git repository\n')).toBe('fatal: not a git repository');
    expect(formatGitStderrLog('line1\n\nline2\n\n')).toBe('line1\n\nline2');
  });

  it('records each spawned git command', async () => {
    const lines: string[] = [];
    setGitCommandLogger((line) => lines.push(line));
    const result = await gitExec('git', process.cwd(), ['--version']);
    expect(result.code).toBe(0);
    expect(lines[0]).toMatch(/^> git --version \[\d+ms\]$/);
  });

  it('records stderr after a failed command', async () => {
    const lines: string[] = [];
    setGitCommandLogger((line) => lines.push(line));
    const result = await gitExec('git', process.cwd(), ['rev-parse', '--verify', 'refs/heads/git-graph-ray-missing']);
    expect(result.code).not.toBe(0);
    expect(lines[0]).toMatch(/^> git rev-parse --verify refs\/heads\/git-graph-ray-missing \[\d+ms\]$/);
    expect(lines[1]).toMatch(/fatal:/);
  });
});
