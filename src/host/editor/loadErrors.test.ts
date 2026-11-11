import { describe, expect, it } from 'vitest';
import {
  createLoadLog,
  GraphLoadError,
  graphLoadFailMessage,
  isUnbornHeadError,
  loadFailurePlan,
  optionalLoad,
  settleLoad,
} from './loadErrors';

describe('settleLoad', () => {
  it('returns the value when the load works', async () => {
    await expect(settleLoad('refs', Promise.resolve([1]), [])).resolves.toEqual({ value: [1] });
  });

  it('keeps the failure next to the fallback', async () => {
    const r = await settleLoad('commits', Promise.reject(new Error('fatal: bad object')), { commits: [], hasMore: false });
    expect(r.value).toEqual({ commits: [], hasMore: false });
    expect(r.error).toBeInstanceOf(GraphLoadError);
    expect(r.error?.stage).toBe('commits');
    expect(r.error?.detail).toBe('fatal: bad object');
  });

  it('describes a missing git', async () => {
    const r = await settleLoad('refs', Promise.reject(Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' })), []);
    expect(graphLoadFailMessage(r.error)).toBe('Could not read branches and tags: spawn git ENOENT');
  });
});

describe('graphLoadFailMessage', () => {
  it('treats other errors as opening the repository', () => {
    expect(graphLoadFailMessage(new Error('permission denied'))).toBe('Could not open the repository: permission denied');
    expect(graphLoadFailMessage('  ')).toBe('Could not open the repository: Unknown error');
  });
});

describe('createLoadLog', () => {
  it('writes the same message once until it changes or is cleared', () => {
    const lines: string[] = [];
    const log = createLoadLog((line) => lines.push(line));
    log.report('load', 'a');
    log.report('load', 'a');
    log.report('load', 'b');
    log.clear('load');
    log.report('load', 'b');
    log.report('load', 'b', true);
    expect(lines).toEqual(['a', 'b', 'b', 'b']);
  });

  it('survives a closed channel', () => {
    const log = createLoadLog(() => {
      throw new Error('closed');
    });
    expect(() => log.report('load', 'a')).not.toThrow();
  });
});

describe('optionalLoad', () => {
  it('logs a failure and uses the fallback', async () => {
    const lines: string[] = [];
    const log = createLoadLog((line) => lines.push(line));
    await expect(optionalLoad(log, 'remotes', 'Could not list remotes', Promise.reject(new Error('boom')), [])).resolves.toEqual([]);
    await optionalLoad(log, 'remotes', 'Could not list remotes', Promise.reject(new Error('boom')), []);
    expect(lines).toEqual(['Could not list remotes: boom']);
    await expect(optionalLoad(log, 'remotes', 'Could not list remotes', Promise.resolve(['origin']), [])).resolves.toEqual(['origin']);
    await optionalLoad(log, 'remotes', 'Could not list remotes', Promise.reject(new Error('boom')), []);
    expect(lines).toHaveLength(2);
  });
});

describe('isUnbornHeadError', () => {
  it('matches git log on a branch with no commits', () => {
    expect(isUnbornHeadError("fatal: your current branch 'main' does not have any commits yet")).toBe(true);
    expect(isUnbornHeadError("fatal: bad default revision 'HEAD'")).toBe(true);
    expect(isUnbornHeadError("fatal: ambiguous argument 'HEAD': unknown revision or path not in the working tree.")).toBe(true);
    expect(isUnbornHeadError('fatal: not a git repository (or any of the parent directories): .git')).toBe(false);
  });
});

describe('loadFailurePlan', () => {
  it('shows the failure on the first load', () => {
    expect(loadFailurePlan({ fromWatch: false, hasSnapshot: false, sameRepo: true })).toEqual({ postSnapshot: true, showFail: true });
    expect(loadFailurePlan({ fromWatch: true, hasSnapshot: false, sameRepo: true })).toEqual({ postSnapshot: true, showFail: true });
  });

  it('keeps the graph and shows the failure on Refresh', () => {
    expect(loadFailurePlan({ fromWatch: false, hasSnapshot: true, sameRepo: true })).toEqual({ postSnapshot: false, showFail: true });
  });

  it('keeps the graph and only logs on an automatic reload', () => {
    expect(loadFailurePlan({ fromWatch: true, hasSnapshot: true, sameRepo: true })).toEqual({ postSnapshot: false, showFail: false });
  });

  it('clears the old graph when the repository changed', () => {
    expect(loadFailurePlan({ fromWatch: false, hasSnapshot: true, sameRepo: false })).toEqual({ postSnapshot: true, showFail: true });
  });
});
