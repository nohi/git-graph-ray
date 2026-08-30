/** Git-for-Windows launches sequence.editor via sh, so backslashes are eaten as escapes. */
export function posixGitPath(p: string): string {
  return p.replace(/\\/g, '/');
}

export function quoteGitPath(p: string): string {
  return `"${posixGitPath(p)}"`;
}

/** Git for Windows: `<prefix>/mingw64/libexec/git-core` → `<prefix>/usr/bin/sh.exe`. */
export function gitShFromExecPath(execPath: string, windows: boolean): string {
  if (!windows) return 'sh';
  const parts = posixGitPath(execPath).replace(/\/+$/, '').split('/');
  const root = parts.slice(0, -3).join('/');
  return `${root}/usr/bin/sh.exe`;
}

export function gitEditorCommand(sh: string, script: string): string {
  const shPart = /[\\/]/.test(sh) ? quoteGitPath(sh) : sh;
  return `${shPart} ${quoteGitPath(script)}`;
}

export function rewordSeqScript(shortHash: string): string {
  return `#!/bin/sh\nsed -i.bak -E 's/^(pick|p) (${shortHash}[0-9a-f]*)/reword \\2/' "$1"\n`;
}

export function rewordEditorScript(msgPosix: string): string {
  const escaped = msgPosix.replaceAll("'", `'\\''`);
  return `#!/bin/sh\ncp '${escaped}' "$1"\n`;
}
