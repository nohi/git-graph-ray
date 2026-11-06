/** Bare words a shell accepts without quotes. Anything else is wrapped in `"`. */
export function shellQuote(value: string): string {
  if (!/[\s"]/.test(value)) return value;
  return `"${value.replaceAll('"', '\\"')}"`;
}

export function interactiveRebaseCommand(ref: string): string {
  return `git rebase --interactive ${shellQuote(ref)}`;
}

type ShellKind = 'cmd' | 'powershell' | 'fish' | 'posix';

function shellKind(shellPath: string): ShellKind {
  const base = shellPath.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? '';
  const name = base.endsWith('.exe') ? base.slice(0, -4) : base;
  if (name === 'cmd') return 'cmd';
  if (name === 'powershell' || name === 'pwsh') return 'powershell';
  if (name === 'fish') return 'fish';
  return 'posix';
}

/**
 * Run `command`, then leave the shell only when it succeeded.
 * A failed rebase stays at the prompt.
 */
export function exitShellOnSuccess(shellPath: string, command: string): string {
  switch (shellKind(shellPath)) {
    case 'cmd':
      return `${command} && exit`;
    case 'powershell':
      return `${command}; if ($LASTEXITCODE -eq 0) { exit }`;
    case 'fish':
      return `${command}; and exit`;
    default:
      return `${command} && exit`;
  }
}
