import { describe, expect, it } from 'vitest';
import { UNCOMMITTED } from './types';
import {
  dateBuckets,
  emptyDateFilter,
  filterBuckets,
  hiddenGaps,
  hideAllMonths,
  hideMonth,
  hideYear,
  monthKey,
  visibleCommitIndices,
  yearCheck,
  type DatedCommit,
} from './dateFilter';

function at(year: number, month: number, day = 15): number {
  return Math.floor(new Date(year, month - 1, day, 12).getTime() / 1000);
}

function commit(year: number, month: number, n: number): DatedCommit {
  const t = at(year, month);
  return { hash: `${year}-${month}-${n}`, authorDate: t, committerDate: t };
}

describe('date filter', () => {
  const commits = [
    commit(2026, 1, 0),
    commit(2025, 12, 1),
    commit(2025, 12, 2),
    commit(2025, 6, 3),
    commit(2025, 6, 4),
    commit(2024, 6, 5),
  ];

  it('nests months under years, newest first, even when the list is not date-sorted', () => {
    const mixed = [commit(2025, 6, 0), commit(2025, 8, 1), commit(2025, 6, 2)];
    expect(dateBuckets(mixed, 'committer')).toEqual([
      {
        year: 2025,
        count: 3,
        months: [
          { year: 2025, month: 8, key: '2025-08', count: 1 },
          { year: 2025, month: 6, key: '2025-06', count: 2 },
        ],
      },
    ]);
  });

  it('hides a month or a whole year and leaves the uncommitted row visible', () => {
    const withDirty: DatedCommit[] = [{ hash: UNCOMMITTED, authorDate: 0, committerDate: 0 }, ...commits];
    const june = hideMonth(emptyDateFilter(), 'committer', monthKey(2025, 6), true);
    expect(visibleCommitIndices(withDirty, june)).toEqual([0, 1, 2, 3, 6]);
    const year = dateBuckets(withDirty, 'committer').find((item) => item.year === 2025)!;
    expect(yearCheck(year, june, 'committer')).toBe('mixed');
    const hiddenYear = hideYear(emptyDateFilter(), 'committer', year, true);
    expect(yearCheck(year, hiddenYear, 'committer')).toBe('unchecked');
    expect(visibleCommitIndices(withDirty, hiddenYear)).toEqual([0, 1, 6]);
    expect(visibleCommitIndices(withDirty, hideAllMonths(emptyDateFilter(), 'committer', dateBuckets(withDirty, 'committer')))).toEqual([0]);
  });

  it('hides author months and committer months independently', () => {
    const mixed: DatedCommit[] = [
      { hash: 'a', authorDate: at(2025, 6), committerDate: at(2025, 8) },
      { hash: 'b', authorDate: at(2025, 8), committerDate: at(2025, 6) },
    ];
    const hideAuthorJune = hideMonth(emptyDateFilter(), 'author', '2025-06', true);
    expect(visibleCommitIndices(mixed, hideAuthorJune)).toEqual([1]);
    const hideCommitterJune = hideMonth(emptyDateFilter(), 'committer', '2025-06', true);
    expect(visibleCommitIndices(mixed, hideCommitterJune)).toEqual([0]);
    expect(visibleCommitIndices(mixed, hideMonth(hideAuthorJune, 'committer', '2025-06', true))).toEqual([]);
    expect(hideAllMonths(hideAuthorJune, 'author', dateBuckets(mixed, 'author')).author.size).toBeGreaterThan(0);
    expect(hideAllMonths(hideAuthorJune, 'committer', dateBuckets(mixed, 'committer')).author.has('2025-06')).toBe(true);
  });

  it('reports the hidden run between the commits that stay on screen', () => {
    const hidden = hideMonth(emptyDateFilter(), 'committer', '2025-12', true);
    expect(hiddenGaps(visibleCommitIndices(commits, hidden))).toEqual([{ above: 0, below: 3 }]);
  });

  it('filters the checkbox tree by year or month text', () => {
    const buckets = dateBuckets(commits, 'committer');
    expect(filterBuckets(buckets, '2024').map((year) => year.year)).toEqual([2024]);
    expect(filterBuckets(buckets, '12').flatMap((year) => year.months.map((month) => month.key))).toEqual(['2025-12']);
  });
});
