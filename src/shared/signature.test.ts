import { describe, expect, it } from 'vitest';
import {
  buildCommitSignature,
  signatureColumn,
  signatureInfoRows,
  signatureKindFromHeader,
  signatureSummary,
} from './signature';

const pgp = `tree abc
author Ada <ada@ex> 1 +0000
committer Ada <ada@ex> 1 +0000
gpgsig -----BEGIN PGP SIGNATURE-----
 
 iQIzBAAB
 -----END PGP SIGNATURE-----`;

describe('signatureKindFromHeader', () => {
  it('reads GPG, SSH, and X.509 armor', () => {
    expect(signatureKindFromHeader(pgp)).toBe('gpg');
    expect(signatureKindFromHeader('gpgsig -----BEGIN SSH SIGNATURE-----')).toBe('ssh');
    expect(signatureKindFromHeader('gpgsig-sha256 -----BEGIN SIGNED MESSAGE-----')).toBe('x509');
  });

  it('ignores a signature mentioned only in the message', () => {
    const header = pgp.split('\n\n')[0] ?? pgp;
    expect(signatureKindFromHeader(`${header}\n\ngpgsig -----BEGIN SSH SIGNATURE-----`)).toBe('gpg');
  });

  it('returns null when the commit is unsigned', () => {
    expect(signatureKindFromHeader('tree abc\nauthor Ada <ada@ex> 1 +0000')).toBeNull();
  });

  it('keeps a known kind when another header is unrecognized', () => {
    expect(signatureKindFromHeader('gpgsig -----BEGIN WEIRD-----\ngpgsig -----BEGIN SSH SIGNATURE-----')).toBe('ssh');
  });
});

describe('buildCommitSignature', () => {
  it('keeps an SSH signature when git reports N because it did not verify', () => {
    const sig = buildCommitSignature({ kind: 'ssh', grade: 'N', fingerprint: 'SHA256:abc', signer: 'Ada' });
    expect(sig).toEqual({
      kind: 'ssh',
      fingerprint: 'SHA256:abc',
      signer: 'Ada',
    });
    expect(signatureInfoRows(sig).map((row) => [row.label, row.value])).toEqual([
      ['Signed', 'Yes'],
      ['Type', 'SSH'],
      ['Signer', 'Ada'],
      ['Fingerprint', 'SHA256:abc'],
    ]);
  });

  it('stays unsigned when the object has no signature', () => {
    expect(buildCommitSignature({ kind: null, grade: 'N', signer: 'Ada' })).toEqual({ kind: null });
  });

  it('keeps type without a grade when verification was not requested', () => {
    expect(buildCommitSignature({ kind: 'ssh' })).toEqual({ kind: 'ssh' });
  });

  it('records signer, key, fingerprint, and trust for a checked signature', () => {
    expect(
      buildCommitSignature({
        kind: 'gpg',
        grade: 'G',
        signer: 'Ada <ada@ex>',
        key: 'ABCD',
        fingerprint: 'F'.repeat(40),
        trust: 'fully',
      }),
    ).toEqual({
      kind: 'gpg',
      grade: 'G',
      signer: 'Ada <ada@ex>',
      key: 'ABCD',
      fingerprint: 'F'.repeat(40),
      trust: 'fully',
    });
  });
});

describe('signatureColumn', () => {
  it('shows No for unsigned commits and the type when signed', () => {
    expect(signatureColumn(null)).toEqual({ text: 'No', title: 'Unsigned', signed: false });
    expect(signatureColumn('gpg').text).toBe('GPG');
    expect(signatureColumn('ssh').title).toBe('Signed · SSH');
    expect(signatureColumn('x509').text).toBe('X.509');
    expect(signatureColumn('unknown').text).toBe('Signed');
  });
});

describe('signatureInfoRows', () => {
  it('reports presence and type without a verification status', () => {
    expect(signatureInfoRows({ kind: 'ssh' }).map((row) => [row.label, row.value])).toEqual([
      ['Signed', 'Yes'],
      ['Type', 'SSH'],
    ]);
    expect(signatureSummary({ kind: 'ssh' })).toEqual({ text: 'SSH', signed: true });
  });

  it('adds status, fingerprint, and the primary key when they differ from the signing key', () => {
    const rows = signatureInfoRows({
      kind: 'gpg',
      grade: 'B',
      signer: 'Ada',
      key: 'ABCD1234',
      fingerprint: 'abc',
      primary: 'def',
      trust: 'never',
    });
    expect(rows.map((row) => row.label)).toEqual([
      'Signed',
      'Type',
      'Status',
      'Signer',
      'Key',
      'Fingerprint',
      'Primary key',
      'Trust',
    ]);
    expect(rows.find((row) => row.label === 'Fingerprint')).toMatchObject({ value: 'abc', copy: 'abc', mono: true });
    expect(rows.find((row) => row.label === 'Status')).toMatchObject({ value: 'Bad', tone: 'bad' });
    expect(rows.find((row) => row.label === 'Trust')?.value).toBe('Never');
    expect(signatureSummary({ kind: 'gpg', grade: 'B' }).tone).toBe('bad');
  });

  it('shows SSH key type, hash, and namespace', () => {
    expect(
      signatureInfoRows({
        kind: 'ssh',
        keyAlgorithm: 'Ed25519',
        hashAlgorithm: 'SHA-512',
        namespace: 'git',
        fingerprint: 'SHA256:abc',
      }).map((row) => [row.label, row.value]),
    ).toEqual([
      ['Signed', 'Yes'],
      ['Type', 'SSH'],
      ['Key type', 'Ed25519'],
      ['Hash', 'SHA-512'],
      ['Namespace', 'git'],
      ['Fingerprint', 'SHA256:abc'],
    ]);
  });

  it('shows GPG signature time, algorithms, and expirations', () => {
    const rows = signatureInfoRows(
      {
        kind: 'gpg',
        keyAlgorithm: 'RSA',
        hashAlgorithm: 'SHA-256',
        signedAt: 1_700_000_000,
        signatureExpires: { state: 'at', time: 1_700_086_400 },
        keyExpires: { state: 'never' },
      },
      (unix) => `t${unix}`,
    );
    expect(rows.map((row) => [row.label, row.value])).toEqual([
      ['Signed', 'Yes'],
      ['Type', 'GPG'],
      ['Public key', 'RSA'],
      ['Hash', 'SHA-256'],
      ['Signature time', 't1700000000'],
      ['Key expiration', 'Never'],
      ['Signature expiration', 't1700086400'],
    ]);
    expect(
      signatureInfoRows({
        kind: 'gpg',
        keyExpires: { state: 'unknown' },
        signatureExpires: { state: 'after', seconds: 172800 },
      }).map((row) => [row.label, row.value]),
    ).toEqual([
      ['Signed', 'Yes'],
      ['Type', 'GPG'],
      ['Key expiration', 'Not included'],
      ['Signature expiration', '2 days after signing'],
    ]);
  });

  it('keeps parsed fields on a signature git did not verify', () => {
    const facts = {
      keyAlgorithm: 'Ed25519',
      hashAlgorithm: 'SHA-512',
      namespace: 'git',
      signedAt: 10,
      signatureExpires: { state: 'never' as const },
      keyExpires: { state: 'unknown' as const },
    };
    expect(buildCommitSignature({ kind: 'ssh', grade: 'N', ...facts })).toMatchObject({ kind: 'ssh', ...facts });
    expect(buildCommitSignature({ kind: null, grade: 'N', ...facts })).toEqual({ kind: null });
  });

  it('hides a key that repeats the fingerprint and an undefined trust level', () => {
    const sig = buildCommitSignature({
      kind: 'ssh',
      grade: 'U',
      key: 'SHA256:abc',
      fingerprint: 'SHA256:abc',
      trust: 'undefined',
    });
    expect(sig.trust).toBeUndefined();
    expect(signatureInfoRows(sig).map((row) => row.label)).toEqual(['Signed', 'Type', 'Status', 'Fingerprint']);
  });

  it('treats a missing signature as unsigned', () => {
    expect(signatureInfoRows(undefined).map((row) => row.value)).toEqual(['No', '—']);
    expect(signatureSummary(undefined).text).toBe('Unsigned');
  });
});
