import { UNCOMMITTED } from './types';

export type DateField = 'author' | 'committer';

export type DatedCommit = {
  hash: string;
  authorDate: number;
  committerDate: number;
};

export type MonthBucket = {
  year: number;
  month: number;
  key: string;
  count: number;
};

export type YearBucket = {
  year: number;
  count: number;
  months: MonthBucket[];
};

/** Months hidden for each date field. A missing key stays visible, including months loaded later. */
export type DateFilter = {
  author: ReadonlySet<string>;
  committer: ReadonlySet<string>;
};

export function emptyDateFilter(): DateFilter {
  return { author: new Set(), committer: new Set() };
}

export function copyDateFilter(filter: DateFilter): { author: Set<string>; committer: Set<string> } {
  return { author: new Set(filter.author), committer: new Set(filter.committer) };
}

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function unixOf(commit: DatedCommit | undefined, field: DateField): number | null {
  if (!commit || commit.hash === UNCOMMITTED) return null;
  const unix = field === 'author' ? commit.authorDate : commit.committerDate;
  return unix || null;
}

function stampOf(commit: DatedCommit, field: DateField): { year: number; month: number } | null {
  const unix = unixOf(commit, field);
  if (unix == null) return null;
  const date = new Date(unix * 1000);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

/** Years newest-first, and months newest-first inside each year. */
export function dateBuckets(commits: DatedCommit[], field: DateField): YearBucket[] {
  const years = new Map<number, Map<number, number>>();
  for (const commit of commits) {
    const stamp = stampOf(commit, field);
    if (!stamp) continue;
    let months = years.get(stamp.year);
    if (!months) {
      months = new Map();
      years.set(stamp.year, months);
    }
    months.set(stamp.month, (months.get(stamp.month) ?? 0) + 1);
  }
  return [...years.keys()]
    .sort((a, b) => b - a)
    .map((year) => {
      const months = [...years.get(year)!.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([month, count]) => ({ year, month, key: monthKey(year, month), count }));
      return { year, count: months.reduce((sum, month) => sum + month.count, 0), months };
    });
}

export function filterBuckets(buckets: YearBucket[], query: string): YearBucket[] {
  const q = query.trim().toLowerCase();
  if (!q) return buckets;
  const out: YearBucket[] = [];
  for (const year of buckets) {
    if (String(year.year).includes(q)) {
      out.push(year);
      continue;
    }
    const months = year.months.filter((month) => month.key.includes(q) || String(month.month).includes(q));
    if (months.length) out.push({ ...year, months, count: months.reduce((sum, month) => sum + month.count, 0) });
  }
  return out;
}

export function yearCheck(year: YearBucket, filter: DateFilter, field: DateField): 'checked' | 'unchecked' | 'mixed' {
  const hiddenMonths = filter[field];
  const hidden = year.months.filter((month) => hiddenMonths.has(month.key)).length;
  if (hidden === 0) return 'checked';
  if (hidden === year.months.length) return 'unchecked';
  return 'mixed';
}

export function hideMonth(filter: DateFilter, field: DateField, key: string, hidden: boolean): DateFilter {
  const next = copyDateFilter(filter);
  if (hidden) next[field].add(key);
  else next[field].delete(key);
  return next;
}

export function hideYear(filter: DateFilter, field: DateField, year: YearBucket, hidden: boolean): DateFilter {
  const next = copyDateFilter(filter);
  for (const month of year.months) {
    if (hidden) next[field].add(month.key);
    else next[field].delete(month.key);
  }
  return next;
}

export function hideAllMonths(filter: DateFilter, field: DateField, buckets: YearBucket[]): DateFilter {
  const next = copyDateFilter(filter);
  next[field].clear();
  for (const year of buckets) {
    for (const month of year.months) next[field].add(month.key);
  }
  return next;
}

export function showAllMonths(filter: DateFilter, field: DateField): DateFilter {
  const next = copyDateFilter(filter);
  next[field].clear();
  return next;
}

export function commitMonthKey(commit: DatedCommit, field: DateField): string | null {
  const stamp = stampOf(commit, field);
  return stamp ? monthKey(stamp.year, stamp.month) : null;
}

export function commitHidden(commit: DatedCommit, filter: DateFilter): boolean {
  if (commit.hash === UNCOMMITTED) return false;
  const author = commitMonthKey(commit, 'author');
  const committer = commitMonthKey(commit, 'committer');
  return (author != null && filter.author.has(author)) || (committer != null && filter.committer.has(committer));
}

/** Drop the author and committer months of one commit so that commit is shown again. */
export function revealCommitMonths(filter: DateFilter, commit: DatedCommit): DateFilter {
  let next = filter;
  const author = commitMonthKey(commit, 'author');
  const committer = commitMonthKey(commit, 'committer');
  if (author) next = hideMonth(next, 'author', author, false);
  if (committer) next = hideMonth(next, 'committer', committer, false);
  return next;
}

export function visibleCommitIndices(commits: DatedCommit[], filter: DateFilter): number[] {
  const indices: number[] = [];
  commits.forEach((commit, index) => {
    if (!commitHidden(commit, filter)) indices.push(index);
  });
  return indices;
}

/** Contiguous hidden runs that sit between two visible commits. */
export function hiddenGaps(visible: number[]): { above: number; below: number }[] {
  const gaps: { above: number; below: number }[] = [];
  for (let i = 0; i < visible.length - 1; i++) {
    const above = visible[i]!;
    const below = visible[i + 1]!;
    if (below > above + 1) gaps.push({ above, below });
  }
  return gaps;
}
