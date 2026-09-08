import { scrypt } from '@noble/hashes/scrypt.js';

const MAGIC = new TextEncoder().encode('PTBK');
/**
 * Backup file format versions.
 *
 * v1 (LEGACY): AES-GCM ciphertext with scrypt-derived key from the
 * user's license key. Written by pre-1.4.0 releases. Still readable —
 * decode falls back to the license key that lives in localStorage
 * under `practicetab.license` (never wiped in 1.4.0 for exactly this
 * reason). Encode is not offered for v1 anymore.
 *
 * v2 (CURRENT): plaintext. PracticeTab is now free / OSS-bound and no
 * longer has a license key to derive from. Backup files are still
 * wrapped in the PTBK header so importers can validate the magic and
 * detect stray files, but the payload itself is the raw JSON envelope.
 */
const FORMAT_VERSION_LEGACY_ENCRYPTED = 1;
const FORMAT_VERSION_PLAINTEXT = 2;
const KEY_LENGTH = 32;

type KdfParams = {
  salt: Uint8Array;
  n: number;
  r: number;
  p: number;
};

function writeU16(target: number[], value: number): void {
  target.push((value >> 8) & 0xff, value & 0xff);
}

function writeU32(target: number[], value: number): void {
  target.push(
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  );
}

function readU16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

function deriveKey(licenseKey: string, params: KdfParams): Uint8Array {
  const passwordBytes = new TextEncoder().encode(licenseKey);
  return scrypt(passwordBytes, params.salt, {
    N: params.n,
    r: params.r,
    p: params.p,
    dkLen: KEY_LENGTH,
  });
}

async function decryptPayload(
  ciphertext: Uint8Array,
  licenseKey: string,
  params: KdfParams,
  nonce: Uint8Array,
): Promise<Uint8Array> {
  const keyBytes = deriveKey(licenseKey, params);
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  );
  const decrypted = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce },
    key,
    ciphertext,
  );
  return new Uint8Array(decrypted);
}

/**
 * Recover the license key persisted by pre-1.4.0 versions of the
 * app, needed only when decoding a legacy (v1) backup file. Returns
 * `null` when no key is available — importing a v1 backup on a fresh
 * install (or a different machine than the one that created it) is
 * therefore an unrecoverable state; the caller surfaces that via
 * `legacy_backup_needs_license_key`.
 *
 * The value lives at localStorage key `practicetab.license` as a JSON
 * object shaped by the retired license store (`{ licenseKey: "..." }`
 * plus other fields we don't care about here). 1.4.0 intentionally
 * does NOT clear this key on upgrade so users can still import their
 * old backups after the free-transition.
 */
function readLegacyLicenseKeyFromStorage(): string | null {
  if (typeof globalThis.localStorage === 'undefined') {
    return null;
  }
  const raw = globalThis.localStorage.getItem('practicetab.license');
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as { licenseKey?: unknown };
    const key = parsed?.licenseKey;
    return typeof key === 'string' && key.length > 0 ? key : null;
  } catch {
    return null;
  }
}

/**
 * Encode a backup payload as PTBK v2 (plaintext). Kept behind the
 * PTBK magic + version header so importers can distinguish real
 * backup files from stray JSON and cleanly route to the legacy
 * decrypt path when they encounter a v1 file.
 */
export async function encodeBackupFile(
  plaintext: Uint8Array,
): Promise<Uint8Array> {
  const header: number[] = [];
  MAGIC.forEach((value) => header.push(value));
  writeU16(header, FORMAT_VERSION_PLAINTEXT);
  writeU32(header, plaintext.length);
  plaintext.forEach((value) => header.push(value));
  return Uint8Array.from(header);
}

/**
 * Decode a backup payload, transparently handling both v2 plaintext
 * files (post-1.4.0) and v1 encrypted files (pre-1.4.0). v1 decode
 * requires the retired license key to still be present in
 * localStorage; when it isn't we throw a distinct error so the UI can
 * tell the user their old backup can only be imported on the machine
 * that created it.
 */
export async function decodeBackupFile(
  payload: Uint8Array,
): Promise<Uint8Array> {
  if (payload.length < MAGIC.length + 2) {
    throw new Error('invalid_backup_file');
  }
  for (let i = 0; i < MAGIC.length; i += 1) {
    if (payload[i] !== MAGIC[i]) {
      throw new Error('invalid_backup_file');
    }
  }
  let offset = MAGIC.length;
  const version = readU16(payload, offset);
  offset += 2;

  if (version === FORMAT_VERSION_PLAINTEXT) {
    const payloadLen = readU32(payload, offset);
    offset += 4;
    if (offset + payloadLen > payload.length) {
      throw new Error('invalid_backup_file');
    }
    return payload.slice(offset, offset + payloadLen);
  }

  if (version === FORMAT_VERSION_LEGACY_ENCRYPTED) {
    const licenseKey = readLegacyLicenseKeyFromStorage();
    if (!licenseKey) {
      throw new Error('legacy_backup_needs_license_key');
    }
    const saltLen = readU16(payload, offset);
    offset += 2;
    const salt = payload.slice(offset, offset + saltLen);
    offset += saltLen;
    const n = readU32(payload, offset);
    offset += 4;
    const r = readU32(payload, offset);
    offset += 4;
    const p = readU32(payload, offset);
    offset += 4;
    const nonceLen = readU16(payload, offset);
    offset += 2;
    const nonce = payload.slice(offset, offset + nonceLen);
    offset += nonceLen;
    const ciphertextLen = readU32(payload, offset);
    offset += 4;
    const ciphertext = payload.slice(offset, offset + ciphertextLen);
    const params: KdfParams = { salt, n, r, p };
    return decryptPayload(ciphertext, licenseKey, params, nonce);
  }

  throw new Error('unsupported_backup_version');
}

export function toBase64(data: Uint8Array): string {
  if (typeof btoa === 'function') {
    let binary = '';
    data.forEach((value) => {
      binary += String.fromCharCode(value);
    });
    return btoa(binary);
  }
  const nodeBuffer = (
    globalThis as {
      Buffer?: {
        from: (payload: Uint8Array) => { toString: (enc: string) => string };
      };
    }
  ).Buffer;
  if (nodeBuffer) {
    return nodeBuffer.from(data).toString('base64');
  }
  throw new Error('base64_unavailable');
}

export function fromBase64(data: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  const nodeBuffer = (
    globalThis as {
      Buffer?: { from: (payload: string, enc: string) => Uint8Array };
    }
  ).Buffer;
  if (nodeBuffer) {
    return Uint8Array.from(nodeBuffer.from(data, 'base64'));
  }
  throw new Error('base64_unavailable');
}
