import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  countTextLines,
  mergeNumstat,
  numstatDestination,
  parseNameStatus,
  parseNumstat,
  resolveRepoRelative,
  unquoteGitPath,
} from './details';

describe('parseNameStatus', () => {
  it('reads status, renames, and quoted paths', () => {
    const files = parseNameStatus('M\tsrc/a.ts\nR100\told.ts\tnew.ts\nA\t"foo bar.ts"\n');
    expect(files).toEqual([
      { status: 'M', path: 'src/a.ts' },
      { status: 'R', oldPath: 'old.ts', path: 'new.ts' },
      { status: 'A', path: 'foo bar.ts' },
    ]);
  });
});

describe('numstat', () => {
  it('parses added and deleted lines and skips binary files', () => {
    const stats = parseNumstat('12\t3\tsrc/a.ts\n-\t-\timage.png\n0\t4\tREADME.md\n');
    expect(stats.get('src/a.ts')).toEqual({ additions: 12, deletions: 3 });
    expect(stats.get('image.png')).toBeUndefined();
    expect(stats.get('README.md')).toEqual({ additions: 0, deletions: 4 });
  });

  it('uses the destination path of a rename', () => {
    expect(numstatDestination('old.ts => new.ts')).toBe('new.ts');
    expect(numstatDestination('src/{old => new}/file.ts')).toBe('src/new/file.ts');
    expect(numstatDestination('file.{txt => md}')).toBe('file.md');
    expect(numstatDestination('{src => lib}/file.ts')).toBe('lib/file.ts');
    const stats = parseNumstat('5\t1\tsrc/{old => new}/file.ts\n2\t0\told.ts => new.ts\n');
    expect(stats.get('src/new/file.ts')).toEqual({ additions: 5, deletions: 1 });
    expect(stats.get('new.ts')).toEqual({ additions: 2, deletions: 0 });
  });

  it('attaches counts onto name-status rows', () => {
    const files = parseNameStatus('M\tsrc/a.ts\nR100\tsrc/old/file.ts\tsrc/new/file.ts\n');
    const stats = parseNumstat('12\t3\tsrc/a.ts\n5\t1\tsrc/{old => new}/file.ts\n');
    expect(mergeNumstat(files, stats)).toEqual([
      { status: 'M', path: 'src/a.ts', additions: 12, deletions: 3 },
      { status: 'R', oldPath: 'src/old/file.ts', path: 'src/new/file.ts', additions: 5, deletions: 1 },
    ]);
  });
});

describe('unquoteGitPath', () => {
  it('decodes quotes, spaces, and octal utf-8 bytes', () => {
    expect(unquoteGitPath('src/a.ts')).toBe('src/a.ts');
    expect(unquoteGitPath('"foo bar.ts"')).toBe('foo bar.ts');
    expect(unquoteGitPath('"\\343\\203\\206"')).toBe('テ');
  });
});

describe('countTextLines', () => {
  it('counts lines the way git numstat does', () => {
    expect(countTextLines(Buffer.from(''))).toBe(0);
    expect(countTextLines(Buffer.from('a\nb\n'))).toBe(2);
    expect(countTextLines(Buffer.from('a\nb'))).toBe(2);
    expect(countTextLines(Buffer.from('a\r\nb\r\n'))).toBe(2);
    expect(countTextLines(Buffer.from([0x61, 0x00]))).toBeUndefined();
  });
});

describe('resolveRepoRelative', () => {
  it('resolves a path inside the repository and rejects escapes', () => {
    const root = path.resolve('repo-root');
    expect(resolveRepoRelative(root, 'src/host')).toBe(path.resolve(root, 'src', 'host'));
    expect(resolveRepoRelative(root, '../outside')).toBeUndefined();
    expect(resolveRepoRelative(root, '')).toBeUndefined();
  });
});
