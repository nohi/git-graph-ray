import { describe, expect, it } from 'vitest';
import { gitEditorCommand, gitShFromExecPath, posixGitPath, quoteGitPath, rewordSeqScript } from './gitPath';

describe('posixGitPath', () => {
  it('turns Windows backslashes into forward slashes', () => {
    expect(posixGitPath('C:\\Users\\KAWANO~1\\AppData\\Local\\Temp\\ggr-reword-B2ggXU\\seq.cmd')).toBe(
      'C:/Users/KAWANO~1/AppData/Local/Temp/ggr-reword-B2ggXU/seq.cmd',
    );
  });

  it('quotes the posix path for GIT_SEQUENCE_EDITOR', () => {
    expect(quoteGitPath('C:\\Temp\\seq.sh')).toBe('"C:/Temp/seq.sh"');
  });
});

describe('gitShFromExecPath', () => {
  it('resolves Git for Windows sh.exe from git --exec-path', () => {
    expect(gitShFromExecPath('C:/Program Files/Git/mingw64/libexec/git-core', true)).toBe(
      'C:/Program Files/Git/usr/bin/sh.exe',
    );
  });

  it('uses sh on non-Windows', () => {
    expect(gitShFromExecPath('/usr/lib/git-core', false)).toBe('sh');
  });
});

describe('gitEditorCommand', () => {
  it('quotes both the shell and script so Git Bash does not eat backslashes', () => {
    expect(gitEditorCommand('C:\\Program Files\\Git\\usr\\bin\\sh.exe', 'C:\\Temp\\ggr\\seq.sh')).toBe(
      '"C:/Program Files/Git/usr/bin/sh.exe" "C:/Temp/ggr/seq.sh"',
    );
  });
});

describe('rewordSeqScript', () => {
  it('rewrites pick to reword for the target abbrev', () => {
    expect(rewordSeqScript('abc1234')).toContain("s/^(pick|p) (abc1234[0-9a-f]*)/reword \\2/");
  });
});
