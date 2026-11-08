import { describe, expect, it } from 'vitest';
import { compareRepos, resolveOpenRepo, workspaceIndexFor } from './openRepo';
import type { RepoInfo } from '../../shared/types';

const main = 'I:/ws/repo';
const feature = 'I:/ws/repo-feature';

function repo(path: string, workspaceIndex = 0): RepoInfo {
  const name = path.slice(path.lastIndexOf('/') + 1);
  return { path, name, workspaceIndex };
}

describe('resolveOpenRepo', () => {
  const repos = [{ path: main }, { path: feature }];

  it('uses the open worktree when only case or slashes differ', () => {
    expect(resolveOpenRepo('I:\\ws\\repo-feature', repos, ['I:/ws/repo'])).toBe(feature);
    expect(resolveOpenRepo('i:/ws/repo-feature', repos, ['i:/ws/repo-feature'])).toBe(feature);
  });

  it('keeps a worktree the user already chose', () => {
    expect(resolveOpenRepo(feature, repos, [main])).toBe(feature);
  });

  it('picks the worktree that contains the open folder', () => {
    expect(resolveOpenRepo('I:/ws/repo/pkg', repos, ['I:/ws/repo/pkg'])).toBe(main);
    expect(resolveOpenRepo('I:/missing', repos, [feature])).toBe(feature);
  });
});

describe('workspaceIndexFor', () => {
  it('does not treat a sibling worktree as inside the folder', () => {
    expect(workspaceIndexFor(feature, [main])).toBe(-1);
    expect(workspaceIndexFor(main, [main])).toBe(0);
    expect(workspaceIndexFor(`${main}/pkg`, [main])).toBe(0);
    expect(workspaceIndexFor(main, [`${main}/pkg`])).toBe(0);
  });
});

describe('compareRepos', () => {
  it('lists repos outside the workspace after workspace folders', () => {
    const outside = repo('I:/ws/a', -1);
    const inside = repo(feature, 0);
    const later = repo('I:/ws/b', -1);
    const sorted = [outside, later, inside].sort((a, b) => compareRepos('workspace', a, b));
    expect(sorted.map((item) => item.path)).toEqual([feature, 'I:/ws/a', 'I:/ws/b']);
  });
});
