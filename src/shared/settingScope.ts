/** Scope that `getConfiguration().get` is using for a window setting. */
export function settingWriteScope(workspaceValue: unknown): 'workspace' | 'user' {
  return workspaceValue !== undefined ? 'workspace' : 'user';
}
