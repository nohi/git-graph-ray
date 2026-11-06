import { afterEach, describe, expect, it, vi } from 'vitest';
import { runInteractiveRebase } from './terminal';

type Term = {
  shown: boolean;
  sent: string[];
  show: () => void;
  sendText: (text: string) => void;
};

const harness = vi.hoisted(() => {
  const terminals: Term[] = [];
  return {
    terminals,
    env: { shell: '/bin/zsh' },
    reset() {
      terminals.length = 0;
      this.env.shell = '/bin/zsh';
    },
  };
});

vi.mock('vscode', () => ({
  env: harness.env,
  window: {
    createTerminal: () => {
      const term: Term = {
        shown: false,
        sent: [],
        show() {
          this.shown = true;
        },
        sendText(text: string) {
          this.sent.push(text);
        },
      };
      harness.terminals.push(term);
      return term;
    },
  },
}));

function start(shellPath?: string): Term {
  runInteractiveRebase('/repo', 'main', shellPath);
  const term = harness.terminals[0];
  if (!term) throw new Error('terminal was not created');
  return term;
}

describe('runInteractiveRebase', () => {
  afterEach(() => {
    harness.reset();
  });

  it('shows a terminal and exits the shell only after a successful rebase', () => {
    const term = start('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
    expect(term.shown).toBe(true);
    expect(term.sent).toEqual(['git rebase --interactive main; if ($LASTEXITCODE -eq 0) { exit }']);
  });

  it('uses && exit for a posix shell', () => {
    const term = start('/bin/bash');
    expect(term.sent).toEqual(['git rebase --interactive main && exit']);
  });

  it('uses the default shell when no shell path is set', () => {
    harness.env.shell = '/usr/bin/fish';
    const term = start();
    expect(term.sent).toEqual(['git rebase --interactive main; and exit']);
  });
});
