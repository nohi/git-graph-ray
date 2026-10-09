import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCatFileBatch, signatureFromCommit, signatureKindFromCommit } from './signature';

function git(cwd: string, args: string[], input?: Buffer): Buffer {
  return execFileSync('git', args, { cwd, input, windowsHide: true });
}

function commitBody(signature: string | null, message: string): Buffer {
  const lines = [
    'tree aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'author Ada <ada@ex> 1 +0000',
    'committer Ada <ada@ex> 1 +0000',
  ];
  if (signature) lines.push(signature);
  return Buffer.from(`${lines.join('\n')}\n\n${message}`, 'utf8');
}

function frame(oid: string, body: Buffer): Buffer {
  return Buffer.concat([Buffer.from(`${oid} commit ${body.length}\n`), body, Buffer.from('\n')]);
}

describe('signatureKindFromCommit', () => {
  it('stops at the header and ignores armor pasted into the message', () => {
    const body = commitBody('gpgsig -----BEGIN PGP SIGNATURE-----\n \n -----END PGP SIGNATURE-----', 'gpgsig -----BEGIN SSH SIGNATURE-----\n');
    expect(signatureKindFromCommit(body)).toBe('gpg');
  });

  it('returns null for an unsigned commit', () => {
    expect(signatureKindFromCommit(commitBody(null, '件名'))).toBeNull();
  });

  it('reads an SSH fingerprint from the signature blob without verifying it', () => {
    const key = Buffer.from('AAAAC3NzaC1lZDI1NTE5AAAAIDtL3ZDccEbSQxbO1f9aNNNPYoluV2KV8kEq1Rmu2dc9', 'base64');
    const version = Buffer.alloc(4);
    version.writeUInt32BE(1, 0);
    const keyLen = Buffer.alloc(4);
    keyLen.writeUInt32BE(key.length, 0);
    const blob = Buffer.concat([Buffer.from('SSHSIG'), version, keyLen, key]);
    const wrapped = blob.toString('base64').match(/.{1,70}/g) ?? [];
    const armor = ['-----BEGIN SSH SIGNATURE-----', ...wrapped, '-----END SSH SIGNATURE-----'].join('\n ');
    const body = commitBody(`gpgsig ${armor}`, 'subject');
    expect(signatureFromCommit(body)).toEqual({
      kind: 'ssh',
      keyAlgorithm: 'Ed25519',
      fingerprint: 'SHA256:vWrYibB6/ApLpF+t+s5EiHX3BeWZNHoTPm6b398+68c',
    });
  });

  it('reads the SSH key type, hash algorithm, and namespace', () => {
    const key = Buffer.from('AAAAC3NzaC1lZDI1NTE5AAAAIDtL3ZDccEbSQxbO1f9aNNNPYoluV2KV8kEq1Rmu2dc9', 'base64');
    const blob = Buffer.concat([
      Buffer.from('SSHSIG'),
      u32(1),
      sshString(key),
      sshString(Buffer.from('git')),
      sshString(Buffer.alloc(0)),
      sshString(Buffer.from('sha512')),
      sshString(Buffer.from('sig')),
    ]);
    const body = commitBody(`gpgsig ${armor('-----BEGIN SSH SIGNATURE-----', '-----END SSH SIGNATURE-----', blob)}`, 'subject');
    expect(signatureFromCommit(body)).toEqual({
      kind: 'ssh',
      keyAlgorithm: 'Ed25519',
      hashAlgorithm: 'SHA-512',
      namespace: 'git',
      fingerprint: 'SHA256:vWrYibB6/ApLpF+t+s5EiHX3BeWZNHoTPm6b398+68c',
    });
  });

  it('reads OpenPGP signature time, algorithms, and expirations', () => {
    const created = 1_700_000_000;
    const packet = v4({ pk: 1, hash: 8, created, sigExpire: 86400, keyExpire: 0 });
    const body = commitBody(
      `gpgsig ${armor('-----BEGIN PGP SIGNATURE-----', '-----END PGP SIGNATURE-----', packet, ['', 'Version: GnuPG v2', ''])}`,
      'subject',
    );
    expect(signatureFromCommit(body)).toEqual({
      kind: 'gpg',
      keyAlgorithm: 'RSA',
      hashAlgorithm: 'SHA-256',
      signedAt: created,
      signatureExpires: { state: 'at', time: created + 86400 },
      keyExpires: { state: 'never' },
    });
  });

  it('prefers hashed OpenPGP subpackets and reports a key lifetime as a duration', () => {
    const hashed = Buffer.concat([subpacket(2, u32(100)), subpacket(9, u32(172800))]);
    const unhashed = subpacket(2, u32(200));
    const body = Buffer.concat([Buffer.from([4, 0, 22, 10]), u16(hashed.length), hashed, u16(unhashed.length), unhashed]);
    const packet = Buffer.concat([Buffer.from([0x89]), u16(body.length), body]);
    const commit = commitBody(`gpgsig ${armor('-----BEGIN PGP SIGNATURE-----', '-----END PGP SIGNATURE-----', packet)}`, 'subject');
    expect(signatureFromCommit(commit)).toMatchObject({
      kind: 'gpg',
      keyAlgorithm: 'EdDSA',
      hashAlgorithm: 'SHA-512',
      signedAt: 100,
      signatureExpires: { state: 'never' },
      keyExpires: { state: 'after', seconds: 172800 },
    });
  });

  it('reads a version 3 OpenPGP signature and leaves key expiry unknown when it is absent', () => {
    const created = 1_700_000_000;
    const body = Buffer.concat([Buffer.from([3, 5, 0]), u32(created), Buffer.alloc(8, 0x11), Buffer.from([17, 8])]);
    const packet = Buffer.concat([Buffer.from([0xc2, body.length]), body]);
    const commit = commitBody(`gpgsig ${armor('-----BEGIN PGP SIGNATURE-----', '-----END PGP SIGNATURE-----', packet)}`, 'subject');
    expect(signatureFromCommit(commit)).toEqual({
      kind: 'gpg',
      keyAlgorithm: 'DSA',
      hashAlgorithm: 'SHA-256',
      signedAt: created,
      signatureExpires: { state: 'never' },
      keyExpires: { state: 'unknown' },
    });
  });

  it('reads a GnuPG signature packet, including a critical expiry and no key expiry', () => {
    const created = 1_791_561_418;
    const body = Buffer.from(
      'tree 4b825dc642cb6eb9a060e54bf8d69288fbee4904\n' +
        'author Ada Tester <ada@ex> 1791561418 +0900\n' +
        'committer Ada Tester <ada@ex> 1791561418 +0900\n' +
        'gpgsig -----BEGIN PGP SIGNATURE-----\n' +
        ' \n' +
        ' iHsEABYKACMWIQQQdNztBswKpMkIb5TtX9PcB0LjAgUCaskOygWDAAk6gAAKCRDt\n' +
        ' X9PcB0LjAh0WAP4/qyl8dAN7vpXwCQ2LutCp2f4MxopB18z6BajUHru5BAD/UJUh\n' +
        ' adP3eVQS3aHCDOCNQyWDAQII+lO60n0X/D4e5Qo=\n' +
        ' =a6dR\n' +
        ' -----END PGP SIGNATURE-----\n' +
        '\n' +
        'signed\n',
      'utf8',
    );
    expect(signatureFromCommit(body)).toEqual({
      kind: 'gpg',
      keyAlgorithm: 'EdDSA',
      hashAlgorithm: 'SHA-512',
      signedAt: created,
      signatureExpires: { state: 'at', time: created + 7 * 86400 },
      keyExpires: { state: 'unknown' },
    });
  });

  it('keeps the GPG kind when the armor does not contain a signature packet', () => {
    const body = commitBody('gpgsig -----BEGIN PGP SIGNATURE-----\n not-a-packet\n -----END PGP SIGNATURE-----', 'subject');
    expect(signatureFromCommit(body)).toEqual({ kind: 'gpg' });
  });
});

function u16(n: number): Buffer {
  const buf = Buffer.alloc(2);
  buf.writeUInt16BE(n, 0);
  return buf;
}

function u32(n: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(n, 0);
  return buf;
}

function sshString(data: Buffer): Buffer {
  return Buffer.concat([u32(data.length), data]);
}

function subpacket(type: number, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from([type]), data]);
  return Buffer.concat([Buffer.from([body.length]), body]);
}

function v4(opts: { pk: number; hash: number; created?: number; sigExpire?: number; keyExpire?: number }): Buffer {
  const subs: Buffer[] = [];
  if (opts.created !== undefined) subs.push(subpacket(2, u32(opts.created)));
  if (opts.sigExpire !== undefined) subs.push(subpacket(3, u32(opts.sigExpire)));
  if (opts.keyExpire !== undefined) subs.push(subpacket(9, u32(opts.keyExpire)));
  const hashed = Buffer.concat(subs);
  const body = Buffer.concat([
    Buffer.from([4, 0, opts.pk, opts.hash]),
    u16(hashed.length),
    hashed,
    u16(0),
    Buffer.from([0xab, 0xcd]),
  ]);
  return Buffer.concat([Buffer.from([0xc2, body.length]), body]);
}

function armor(begin: string, end: string, payload: Buffer, preface: string[] = []): string {
  const wrapped = payload.toString('base64').match(/.{1,64}/g) ?? [];
  return [begin, ...preface, ...wrapped, '=abcd', end].join('\n ');
}

describe('parseCatFileBatch', () => {
  it('reads each object by byte size, including a multibyte message', () => {
    const first = commitBody('gpgsig -----BEGIN SSH SIGNATURE-----', '件名');
    const second = commitBody(null, 'plain');
    const buf = Buffer.concat([
      frame('a'.repeat(40), first),
      frame('b'.repeat(40), second),
      Buffer.from(`${'c'.repeat(40)} missing\n`),
    ]);
    const kinds = parseCatFileBatch(buf);
    expect(kinds.get('a'.repeat(40))).toBe('ssh');
    expect(kinds.get('b'.repeat(40))).toBeNull();
    expect(kinds.get('c'.repeat(40))).toBeNull();
  });

  it('reads signature types from git cat-file --batch', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ggr-sig-'));
    try {
      git(dir, ['init', '-q']);
      const tree = git(dir, ['hash-object', '-t', 'tree', '-w', '--stdin'], Buffer.alloc(0)).toString('utf8').trim();
      const signed = Buffer.from(
        `tree ${tree}\nauthor Ada <ada@ex> 1 +0000\ncommitter Ada <ada@ex> 1 +0000\ngpgsig -----BEGIN SSH SIGNATURE-----\n U1NI\n -----END SSH SIGNATURE-----\n\nsubject\n`,
      );
      const plain = Buffer.from(`tree ${tree}\nauthor Ada <ada@ex> 1 +0000\ncommitter Ada <ada@ex> 1 +0000\n\nunsigned\n`);
      const signedId = git(dir, ['hash-object', '-t', 'commit', '-w', '--stdin'], signed).toString('utf8').trim();
      const plainId = git(dir, ['hash-object', '-t', 'commit', '-w', '--stdin'], plain).toString('utf8').trim();
      const batch = git(dir, ['cat-file', '--batch'], Buffer.from(`${signedId}\n${plainId}\n`));
      const kinds = parseCatFileBatch(batch);
      expect(kinds.get(signedId)).toBe('ssh');
      expect(kinds.get(plainId)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('signed commits in this repository', () => {
  it('reads the SSH key type, hash, and namespace without verifying', () => {
    const body = git(process.cwd(), ['cat-file', 'commit', '6b42b75712deb06ea8e1a3452a9ad5f75e311e14']);
    expect(signatureFromCommit(body)).toMatchObject({
      kind: 'ssh',
      keyAlgorithm: 'Ed25519',
      hashAlgorithm: 'SHA-512',
      namespace: 'git',
      fingerprint: 'SHA256:xi4kDxQ45roJSy5NJrsWy6EWhj2pHmjvMZrvKFJZ2P4',
    });
  });
});
