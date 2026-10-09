import { createHash } from 'node:crypto';
import { UNCOMMITTED, type GraphCommit } from '../../shared/types';
import { signatureKindFromHeader, type SignatureKind, type SignatureLifetime } from '../../shared/signature';
import { gitExec } from './runner';

export type CommitObjectSignature = {
  kind: SignatureKind | null;
  /** SSH key fingerprint taken from the signature blob, without verification. */
  fingerprint?: string;
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

/** Read the signature armor from a commit object. Does not verify it. */
export function signatureFromCommit(body: Buffer): CommitObjectSignature {
  const end = indexOfBytes(body, Buffer.from('\n\n'));
  const header = (end >= 0 ? body.subarray(0, end) : body).toString('latin1');
  const kind = signatureKindFromHeader(header);
  if (kind === 'ssh') return { kind, ...readSshSignature(header) };
  if (kind === 'gpg') return { kind, ...readPgpSignature(header) };
  return { kind };
}

export function signatureKindFromCommit(body: Buffer): SignatureKind | null {
  return signatureFromCommit(body).kind;
}

/** OpenSSH `SSHSIG` version 1 stores the public key ahead of the signature. */
export function sshFingerprintFromHeader(header: string): string | null {
  return readSshSignature(header).fingerprint ?? null;
}

export function parseCatFileBatch(buf: Buffer): Map<string, SignatureKind | null> {
  const map = new Map<string, SignatureKind | null>();
  let i = 0;
  while (i < buf.length) {
    const nl = buf.indexOf(0x0a, i);
    if (nl < 0) break;
    const header = buf.toString('utf8', i, nl);
    i = nl + 1;
    if (!header) continue;
    const parts = header.split(' ');
    const oid = parts[0] ?? '';
    if (!oid) continue;
    const size = Number(parts[2]);
    if (parts.length < 3 || parts[1] === 'missing' || !Number.isFinite(size) || size < 0) {
      map.set(oid, null);
      if (parts.length < 3 || parts[1] === 'missing') continue;
      break;
    }
    if (i + size > buf.length) break;
    const body = buf.subarray(i, i + size);
    i += size;
    if (buf[i] === 0x0a) i += 1;
    map.set(oid, signatureKindFromCommit(body));
  }
  return map;
}

/** Presence and type for the graph column. Verification is left to the open commit. */
export async function attachSignatureKinds(git: string, cwd: string, commits: GraphCommit[]): Promise<void> {
  const hashes = commits.map((c) => c.hash).filter((hash) => hash !== UNCOMMITTED);
  if (!hashes.length) return;
  const result = await gitExec(git, cwd, ['cat-file', '--batch'], { stdin: `${hashes.join('\n')}\n` });
  const kinds = parseCatFileBatch(result.stdout);
  for (const commit of commits) {
    if (!kinds.has(commit.hash)) continue;
    commit.signatureKind = kinds.get(commit.hash) ?? null;
  }
}

function readSshSignature(header: string): Omit<CommitObjectSignature, 'kind'> {
  try {
    const buf = armorPayload(header, '-----BEGIN SSH SIGNATURE-----');
    return buf ? parseSshSig(buf) ?? {} : {};
  } catch {
    return {};
  }
}

function readPgpSignature(header: string): Omit<CommitObjectSignature, 'kind'> {
  try {
    const buf = armorPayload(header, '-----BEGIN PGP SIGNATURE-----');
    return buf ? parsePgpPackets(buf) ?? {} : {};
  } catch {
    return {};
  }
}

/** Lines of one armored signature, ignoring armor headers and the CRC line. */
function armorPayload(header: string, begin: string): Buffer | null {
  const parts: string[] = [];
  let inside = false;
  for (const raw of header.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line) break;
    const match = /^(?:gpgsig|gpgsig-sha256) (.+)$/.exec(line);
    const text = match?.[1] ?? (inside && line.startsWith(' ') ? line.slice(1) : '');
    if (!inside) {
      if (text.startsWith(begin)) inside = true;
      continue;
    }
    if (text.startsWith('-----END ')) break;
    if (!text || text.startsWith('=') || text.includes(':')) continue;
    if (!/^[A-Za-z0-9+/=]+$/.test(text)) continue;
    parts.push(text);
  }
  if (!parts.length) return null;
  const buf = Buffer.from(parts.join(''), 'base64');
  return buf.length ? buf : null;
}

/**
 * SSHSIG v1: magic, version, public key, namespace, reserved, hash algorithm, signature.
 * The key type is the first string inside the public key.
 */
function parseSshSig(buf: Buffer): Omit<CommitObjectSignature, 'kind'> | null {
  if (buf.length < 14 || buf.subarray(0, 6).toString('latin1') !== 'SSHSIG') return null;
  if (readFixedLen(buf, 6, 4) !== 1) return null;
  const key = readSshString(buf, 10);
  if (!key || key.value.length === 0) return null;
  const digest = createHash('sha256').update(key.value).digest('base64').replace(/=+$/g, '');
  const out: Omit<CommitObjectSignature, 'kind'> = { fingerprint: `SHA256:${digest}` };
  const keyType = readSshString(key.value, 0);
  const keyLabel = sshKeyTypeLabel(ascii(keyType?.value));
  if (keyLabel) out.keyAlgorithm = keyLabel;
  const namespace = readSshString(buf, key.next);
  const reserved = namespace ? readSshString(buf, namespace.next) : null;
  const hash = reserved ? readSshString(buf, reserved.next) : null;
  const namespaceText = ascii(namespace?.value);
  if (namespaceText) out.namespace = namespaceText;
  const hashText = hashLabel(ascii(hash?.value));
  if (hashText) out.hashAlgorithm = hashText;
  return out;
}

function readSshString(buf: Buffer, offset: number): { value: Buffer; next: number } | null {
  const len = readFixedLen(buf, offset, 4);
  if (len === null) return null;
  const start = offset + 4;
  const end = start + len;
  if (end > buf.length) return null;
  return { value: buf.subarray(start, end), next: end };
}

function parsePgpPackets(buf: Buffer): Omit<CommitObjectSignature, 'kind'> | null {
  let offset = 0;
  while (offset < buf.length) {
    const packet = readPacket(buf, offset);
    if (!packet || packet.next <= offset) return null;
    if (packet.tag === 2) return parseSignaturePacket(packet.body);
    offset = packet.next;
  }
  return null;
}

/** OpenPGP signature packet versions 3, 4, and 6. Expiry lives in subpackets and is often absent. */
function parseSignaturePacket(body: Buffer): Omit<CommitObjectSignature, 'kind'> | null {
  if (!body.length) return null;
  const version = body[0]!;
  if (version === 3) return parseV3Signature(body);
  if (version !== 4 && version !== 6) return null;
  if (body.length < 4) return null;
  const out: Omit<CommitObjectSignature, 'kind'> = {
    keyAlgorithm: pgpPublicKey(body[2]!),
    hashAlgorithm: pgpHash(body[3]!),
  };
  const lenBytes = version === 6 ? 4 : 2;
  let i = 4;
  const hashedLen = readFixedLen(body, i, lenBytes);
  if (hashedLen === null || i + lenBytes + hashedLen > body.length) return out;
  i += lenBytes;
  const hashed = body.subarray(i, i + hashedLen);
  i += hashedLen;
  const unhashedLen = readFixedLen(body, i, lenBytes);
  if (unhashedLen === null || i + lenBytes + unhashedLen > body.length) return out;
  i += lenBytes;
  const unhashed = body.subarray(i, i + unhashedLen);
  const hashedSubs = readSubpackets(hashed);
  const unhashedSubs = readSubpackets(unhashed);
  if (!hashedSubs || !unhashedSubs) return out;
  applyExpiry(out, hashedSubs, unhashedSubs);
  return out;
}

function parseV3Signature(body: Buffer): Omit<CommitObjectSignature, 'kind'> | null {
  if (body.length < 17 || body[1] !== 5) return null;
  const signedAt = readFixedLen(body, 3, 4);
  const out: Omit<CommitObjectSignature, 'kind'> = {
    keyAlgorithm: pgpPublicKey(body[15]!),
    hashAlgorithm: pgpHash(body[16]!),
    signatureExpires: { state: 'never' },
    keyExpires: { state: 'unknown' },
  };
  if (signedAt) out.signedAt = signedAt;
  return out;
}

function applyExpiry(
  out: Omit<CommitObjectSignature, 'kind'>,
  hashed: Array<{ type: number; data: Buffer }>,
  unhashed: Array<{ type: number; data: Buffer }>,
): void {
  let created: number | undefined;
  let sigExpire: number | undefined;
  let keyExpire: number | undefined;
  const take = (subs: Array<{ type: number; data: Buffer }>) => {
    for (const sub of subs) {
      if (sub.data.length < 4) continue;
      const value = readFixedLen(sub.data, 0, 4);
      if (value === null) continue;
      if (sub.type === 2 && created === undefined) created = value;
      else if (sub.type === 3 && sigExpire === undefined) sigExpire = value;
      else if (sub.type === 9 && keyExpire === undefined) keyExpire = value;
    }
  };
  take(hashed);
  take(unhashed);
  if (created) out.signedAt = created;
  if (sigExpire === undefined || sigExpire === 0) out.signatureExpires = { state: 'never' };
  else if (created) out.signatureExpires = { state: 'at', time: created + sigExpire };
  else out.signatureExpires = { state: 'after', seconds: sigExpire };
  if (keyExpire === undefined) out.keyExpires = { state: 'unknown' };
  else if (keyExpire === 0) out.keyExpires = { state: 'never' };
  else out.keyExpires = { state: 'after', seconds: keyExpire };
}

function readPacket(buf: Buffer, offset: number): { tag: number; body: Buffer; next: number } | null {
  if (offset >= buf.length) return null;
  const ctb = buf[offset]!;
  if ((ctb & 0x80) === 0) return null;
  if ((ctb & 0x40) !== 0) {
    const tag = ctb & 0x3f;
    const len = readNewPacketLength(buf, offset + 1);
    if (!len) return null;
    const start = offset + 1 + len.bytes;
    const end = start + len.value;
    if (end > buf.length) return null;
    return { tag, body: buf.subarray(start, end), next: end };
  }
  const tag = (ctb >> 2) & 0x0f;
  const lenType = ctb & 0x03;
  if (lenType === 3) return { tag, body: buf.subarray(offset + 1), next: buf.length };
  const sizeOf = [1, 2, 4][lenType]!;
  const len = readFixedLen(buf, offset + 1, sizeOf);
  if (len === null) return null;
  const start = offset + 1 + sizeOf;
  const end = start + len;
  if (end > buf.length) return null;
  return { tag, body: buf.subarray(start, end), next: end };
}

function readNewPacketLength(buf: Buffer, offset: number): { value: number; bytes: number } | null {
  if (offset >= buf.length) return null;
  const first = buf[offset]!;
  if (first < 192) return { value: first, bytes: 1 };
  if (first < 224) {
    if (offset + 1 >= buf.length) return null;
    return { value: (first - 192) * 256 + buf[offset + 1]! + 192, bytes: 2 };
  }
  if (first !== 255 || offset + 5 > buf.length) return null;
  const value = readFixedLen(buf, offset + 1, 4);
  return value === null ? null : { value, bytes: 5 };
}

function readSubpackets(data: Buffer): Array<{ type: number; data: Buffer }> | null {
  const out: Array<{ type: number; data: Buffer }> = [];
  let i = 0;
  while (i < data.length) {
    const len = readSubpacketLength(data, i);
    if (!len || len.value < 1) return null;
    const start = i + len.bytes;
    const end = start + len.value;
    if (end > data.length) return null;
    out.push({ type: data[start]! & 0x7f, data: data.subarray(start + 1, end) });
    i = end;
  }
  return out;
}

/** Subpacket lengths use the five-octet form at 255. Octets 192–254 are two-octet lengths, not partial bodies. */
function readSubpacketLength(buf: Buffer, offset: number): { value: number; bytes: number } | null {
  if (offset >= buf.length) return null;
  const first = buf[offset]!;
  if (first < 192) return { value: first, bytes: 1 };
  if (first < 255) {
    if (offset + 1 >= buf.length) return null;
    return { value: (first - 192) * 256 + buf[offset + 1]! + 192, bytes: 2 };
  }
  if (offset + 5 > buf.length) return null;
  const value = readFixedLen(buf, offset + 1, 4);
  return value === null ? null : { value, bytes: 5 };
}

function readFixedLen(buf: Buffer, offset: number, bytes: number): number | null {
  if (offset + bytes > buf.length) return null;
  let value = 0;
  for (let i = 0; i < bytes; i++) value = value * 256 + buf[offset + i]!;
  return value;
}

function ascii(buf: Buffer | undefined): string | undefined {
  if (!buf?.length) return undefined;
  for (const byte of buf) {
    if (byte < 0x20 || byte > 0x7e) return undefined;
  }
  return buf.toString('ascii');
}

function sshKeyTypeLabel(type: string | undefined): string | undefined {
  if (!type) return undefined;
  const known: Record<string, string> = {
    'ssh-ed25519': 'Ed25519',
    'ssh-rsa': 'RSA',
    'rsa-sha2-256': 'RSA',
    'rsa-sha2-512': 'RSA',
    'ecdsa-sha2-nistp256': 'ECDSA P-256',
    'ecdsa-sha2-nistp384': 'ECDSA P-384',
    'ecdsa-sha2-nistp521': 'ECDSA P-521',
    'sk-ssh-ed25519@openssh.com': 'Ed25519 (security key)',
    'sk-ecdsa-sha2-nistp256@openssh.com': 'ECDSA P-256 (security key)',
  };
  return known[type] ?? type;
}

function hashLabel(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const known: Record<string, string> = {
    sha1: 'SHA-1',
    sha256: 'SHA-256',
    sha384: 'SHA-384',
    sha512: 'SHA-512',
    md5: 'MD5',
  };
  return known[name.toLowerCase()] ?? name;
}

function pgpPublicKey(id: number): string {
  const known: Record<number, string> = {
    1: 'RSA',
    2: 'RSA',
    3: 'RSA',
    16: 'ElGamal',
    17: 'DSA',
    18: 'ECDH',
    19: 'ECDSA',
    22: 'EdDSA',
    27: 'Ed25519',
    28: 'X25519',
  };
  return known[id] ?? `Algorithm ${id}`;
}

function pgpHash(id: number): string {
  const known: Record<number, string> = {
    1: 'MD5',
    2: 'SHA-1',
    3: 'RIPEMD-160',
    8: 'SHA-256',
    9: 'SHA-384',
    10: 'SHA-512',
    11: 'SHA-224',
    12: 'SHA3-256',
    13: 'SHA3-384',
    14: 'SHA3-512',
  };
  return known[id] ?? `Hash ${id}`;
}

function indexOfBytes(buf: Buffer, needle: Buffer): number {
  if (!needle.length) return 0;
  const limit = buf.length - needle.length;
  for (let i = 0; i <= limit; i++) {
    let match = true;
    for (let j = 0; j < needle.length; j++) {
      if (buf[i + j] !== needle[j]) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }
  return -1;
}
