import { t } from '@vscode/l10n';

/** Cryptographic signature stored on a commit, without a validity judgement. */
export type SignatureKind = 'gpg' | 'ssh' | 'x509' | 'unknown';

/** `git log` / `git show` `%G?` grade. */
export type SignatureGrade = 'G' | 'B' | 'U' | 'X' | 'Y' | 'R' | 'E' | 'N';

/**
 * How long a key or signature stays valid.
 * `at` is a unix time. `after` is a duration whose start (key creation or signing) is named by the row.
 * `unknown` means this signature packet does not carry the value.
 */
export type SignatureLifetime =
  | { state: 'never' }
  | { state: 'unknown' }
  | { state: 'at'; time: number }
  | { state: 'after'; seconds: number };

export type CommitSignature = {
  /** Null when the commit object has no signature. */
  kind: SignatureKind | null;
  /** Set only when signature verification was requested. */
  grade?: SignatureGrade;
  signer?: string;
  key?: string;
  fingerprint?: string;
  /** Primary key fingerprint when a subkey signed the commit. */
  primary?: string;
  trust?: string;
  /** SSH key type, or the OpenPGP public-key algorithm. */
  keyAlgorithm?: string;
  hashAlgorithm?: string;
  /** SSH signature namespace, usually `git`. */
  namespace?: string;
  /** OpenPGP signature creation time, unix seconds. */
  signedAt?: number;
  signatureExpires?: SignatureLifetime;
  keyExpires?: SignatureLifetime;
};

export type SignatureInfoRow = {
  label: string;
  value: string;
  copy?: string;
  tone?: 'good' | 'bad' | 'warn';
  mono?: boolean;
};

const GRADES = new Set<string>(['G', 'B', 'U', 'X', 'Y', 'R', 'E', 'N']);

export function signatureKindLabel(kind: SignatureKind): string {
  switch (kind) {
    case 'gpg':
      return 'GPG';
    case 'ssh':
      return 'SSH';
    case 'x509':
      return 'X.509';
    case 'unknown':
      return t('Unknown');
  }
}

export function signatureGradeLabel(grade: SignatureGrade): string {
  switch (grade) {
    case 'G':
      return t('Good');
    case 'B':
      return t('Bad');
    case 'U':
      return t('Unknown validity');
    case 'X':
      return t('Expired');
    case 'Y':
      return t('Expired key');
    case 'R':
      return t('Revoked key');
    case 'E':
      return t('Cannot be checked');
    case 'N':
      return t('None');
  }
}

export function signatureGradeTone(grade: SignatureGrade): 'good' | 'bad' | 'warn' {
  if (grade === 'G') return 'good';
  if (grade === 'B' || grade === 'R' || grade === 'E') return 'bad';
  return 'warn';
}

export function signatureTrustLabel(trust: string): string {
  const known: Record<string, string> = {
    undefined: t('Undefined'),
    never: t('Never'),
    marginal: t('Marginal'),
    fully: t('Fully'),
    ultimate: t('Ultimate'),
  };
  return known[trust.toLowerCase()] ?? trust;
}

/** First line of a `gpgsig` header, before the commit message. */
export function signatureKindFromHeader(header: string): SignatureKind | null {
  let found: SignatureKind | null = null;
  for (const raw of header.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line) break;
    const match = /^(?:gpgsig|gpgsig-sha256) (.+)$/.exec(line);
    const armor = match?.[1];
    if (!armor) continue;
    const kind = kindFromArmor(armor);
    if (!found || (found === 'unknown' && kind !== 'unknown')) found = kind;
  }
  return found;
}

function kindFromArmor(armor: string): SignatureKind {
  if (armor.startsWith('-----BEGIN PGP SIGNATURE-----')) return 'gpg';
  if (armor.startsWith('-----BEGIN SSH SIGNATURE-----')) return 'ssh';
  if (armor.startsWith('-----BEGIN SIGNED MESSAGE-----')) return 'x509';
  return 'unknown';
}

export function buildCommitSignature(input: {
  kind: SignatureKind | null;
  grade?: string;
  signer?: string;
  key?: string;
  fingerprint?: string;
  primary?: string;
  trust?: string;
  keyAlgorithm?: string;
  hashAlgorithm?: string;
  namespace?: string;
  signedAt?: number;
  signatureExpires?: SignatureLifetime;
  keyExpires?: SignatureLifetime;
}): CommitSignature {
  const gradeText = input.grade?.trim() ?? '';
  let grade = GRADES.has(gradeText) ? (gradeText as SignatureGrade) : undefined;
  let kind = input.kind;
  // Git reports N for an SSH signature when gpg.ssh.allowedSignersFile is unset.
  // The commit object is what decides whether a signature is present.
  if (grade === 'N' && kind) grade = undefined;
  if (grade === 'N') kind = null;
  else if (!kind && grade) kind = 'unknown';
  const sig: CommitSignature = { kind };
  if (!kind) return sig;
  if (grade) sig.grade = grade;
  const signer = input.signer?.trim();
  const key = input.key?.trim();
  const fingerprint = input.fingerprint?.trim();
  const primary = input.primary?.trim();
  const trust = input.trust?.trim();
  if (signer) sig.signer = signer;
  if (key) sig.key = key;
  if (fingerprint) sig.fingerprint = fingerprint;
  if (primary && primary !== fingerprint) sig.primary = primary;
  if (trust && trust.toLowerCase() !== 'undefined') sig.trust = trust;
  if (input.keyAlgorithm) sig.keyAlgorithm = input.keyAlgorithm;
  if (input.hashAlgorithm) sig.hashAlgorithm = input.hashAlgorithm;
  if (input.namespace) sig.namespace = input.namespace;
  if (input.signedAt) sig.signedAt = input.signedAt;
  if (input.signatureExpires) sig.signatureExpires = input.signatureExpires;
  if (input.keyExpires) sig.keyExpires = input.keyExpires;
  return sig;
}

export function signatureColumn(kind: SignatureKind | null | undefined): { text: string; title: string; signed: boolean } {
  if (!kind) return { text: t('No'), title: t('Unsigned'), signed: false };
  const label = signatureKindLabel(kind);
  if (kind === 'unknown') return { text: t('Signed'), title: t('Signed · unknown type'), signed: true };
  return { text: label, title: t('Signed · {0}', label), signed: true };
}

export function signatureSummary(sig: CommitSignature | undefined): { text: string; signed: boolean; tone?: 'good' | 'bad' | 'warn' } {
  const col = signatureColumn(sig?.kind);
  if (!col.signed) return { text: t('Unsigned'), signed: false };
  const tone = sig?.grade ? signatureGradeTone(sig.grade) : undefined;
  return { text: col.text, signed: true, tone };
}

export function signatureInfoRows(
  sig: CommitSignature | undefined,
  formatDate: (unix: number) => string = utcStamp,
): SignatureInfoRow[] {
  const kind = sig?.kind ?? null;
  const rows: SignatureInfoRow[] = [
    { label: t('Signed'), value: kind ? t('Yes') : t('No') },
    { label: t('Type'), value: kind ? signatureKindLabel(kind) : '—' },
  ];
  if (!kind || !sig) return rows;
  if (sig.grade) rows.push({ label: t('Status'), value: signatureGradeLabel(sig.grade), tone: signatureGradeTone(sig.grade) });
  if (sig.signer) rows.push({ label: t('Signer'), value: sig.signer, copy: sig.signer });
  if (sig.keyAlgorithm) rows.push({ label: kind === 'ssh' ? t('Key type') : t('Public key'), value: sig.keyAlgorithm });
  if (sig.hashAlgorithm) rows.push({ label: t('Hash'), value: sig.hashAlgorithm });
  if (sig.namespace) rows.push({ label: t('Namespace'), value: sig.namespace });
  if (sig.signedAt) rows.push({ label: t('Signature time'), value: formatDate(sig.signedAt) });
  if (sig.keyExpires) rows.push({ label: t('Key expiration'), value: lifetimeText(sig.keyExpires, formatDate, t('key creation')) });
  if (sig.signatureExpires) rows.push({ label: t('Signature expiration'), value: lifetimeText(sig.signatureExpires, formatDate, t('signing')) });
  if (sig.key && sig.key !== sig.fingerprint) rows.push({ label: t('Key'), value: sig.key, copy: sig.key, mono: true });
  if (sig.fingerprint) rows.push({ label: t('Fingerprint'), value: sig.fingerprint, copy: sig.fingerprint, mono: true });
  if (sig.primary) rows.push({ label: t('Primary key'), value: sig.primary, copy: sig.primary, mono: true });
  if (sig.trust) rows.push({ label: t('Trust'), value: signatureTrustLabel(sig.trust) });
  return rows;
}

function lifetimeText(life: SignatureLifetime, formatDate: (unix: number) => string, after: string): string {
  switch (life.state) {
    case 'never':
      return t('Never');
    case 'unknown':
      return t('Not included');
    case 'at':
      return formatDate(life.time) || utcStamp(life.time);
    case 'after':
      return life.seconds > 0 ? durationAfter(life.seconds, after) : t('Never');
  }
}

function durationAfter(seconds: number, event: string): string {
  const units: Array<[number, string, string]> = [
    [86400, t('day'), t('days')],
    [3600, t('hour'), t('hours')],
    [60, t('minute'), t('minutes')],
    [1, t('second'), t('seconds')],
  ];
  for (const [size, singular, plural] of units) {
    if (seconds % size === 0) {
      const count = seconds / size;
      return t('{0} {1} after {2}', count, count === 1 ? singular : plural, event);
    }
  }
  return t('{0} {1} after {2}', seconds, t('seconds'), event);
}

function utcStamp(unix: number): string {
  const d = new Date(unix * 1000);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toISOString().replace('T', ' ').slice(0, 19)} UTC`;
}
