import type { GraphCommit } from './types';

export type CheckoutPlan =
  | { kind: 'noop' }
  | { kind: 'local'; name: string }
  | { kind: 'promptCreate'; remoteBranch: string; localName: string }
  | { kind: 'confirmPull'; name: string; remote: string; branch: string };

export function findLocalBranchHash(commits: GraphCommit[], name: string): string | undefined {
  for (const c of commits) {
    if (c.refs.some((r) => r.kind === 'head' && r.name === name)) return c.hash;
  }
  return undefined;
}

export function startCheckoutFromRef(
  commits: GraphCommit[],
  ref: { kind: string; name: string; remote?: string; hash?: string },
  currentBranch: string | null,
): CheckoutPlan {
  if (ref.kind === 'head') {
    if (ref.name === currentBranch) return { kind: 'noop' };
    return { kind: 'local', name: ref.name };
  }
  if (ref.kind === 'remote') {
    const localName = ref.name.includes('/') ? ref.name.slice(ref.name.indexOf('/') + 1) : ref.name;
    return remoteCheckoutPlan(commits, ref.name, localName, ref.hash, currentBranch);
  }
  return { kind: 'noop' };
}

export function decideNamedRemoteCheckout(
  commits: GraphCommit[],
  remoteBranch: string,
  localName: string,
  remoteHash?: string,
  currentBranch: string | null = null,
): CheckoutPlan {
  return remoteCheckoutPlan(commits, remoteBranch, localName, remoteHash, currentBranch);
}

function remoteCheckoutPlan(
  commits: GraphCommit[],
  remoteBranch: string,
  localName: string,
  remoteHash: string | undefined,
  currentBranch: string | null = null,
): CheckoutPlan {
  const localHash = findLocalBranchHash(commits, localName);
  if (!localHash) return { kind: 'promptCreate', remoteBranch, localName };
  const remote = remoteBranch.split('/')[0] ?? 'origin';
  if (remoteHash && localHash === remoteHash) {
    if (localName === currentBranch) return { kind: 'noop' };
    return { kind: 'local', name: localName };
  }
  return { kind: 'confirmPull', name: localName, remote, branch: localName };
}
