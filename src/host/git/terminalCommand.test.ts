import { describe, expect, it } from 'vitest';
import { exitShellOnSuccess, interactiveRebaseCommand } from './terminalCommand';

describe('interactiveRebaseCommand', () => {
  it('quotes a ref that a shell would split', () => {
    expect(interactiveRebaseCommand('main')).toBe('git rebase --interactive main');
    expect(interactiveRebaseCommand('feature login')).toBe('git rebase --interactive "feature login"');
    expect(interactiveRebaseCommand('a"b')).toBe('git rebase --interactive "a\\"b"');
  });
});

describe('exitShellOnSuccess', () => {
  const command = 'git rebase --interactive main';

  it('exits cmd and posix shells only after a successful command', () => {
    expect(exitShellOnSuccess('C:\\Windows\\System32\\cmd.exe', command)).toBe(`${command} && exit`);
    expect(exitShellOnSuccess('/bin/zsh', command)).toBe(`${command} && exit`);
    expect(exitShellOnSuccess('C:\\Program Files\\Git\\bin\\bash.exe', command)).toBe(`${command} && exit`);
  });

  it('uses the PowerShell exit code, including pwsh', () => {
    const line = `${command}; if ($LASTEXITCODE -eq 0) { exit }`;
    expect(exitShellOnSuccess('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', command)).toBe(line);
    expect(exitShellOnSuccess('/usr/local/bin/pwsh', command)).toBe(line);
  });

  it('uses fish and', () => {
    expect(exitShellOnSuccess('/usr/bin/fish', command)).toBe(`${command}; and exit`);
  });
});
