const PTBACKUP_MAGIC = new TextEncoder().encode('PTBK');
const PTSHARE_MAGIC = new TextEncoder().encode('PTSH');

function readU16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function matchesMagic(bytes: Uint8Array, magic: Uint8Array): boolean {
  if (bytes.length < magic.length + 2) {
    return false;
  }
  for (let i = 0; i < magic.length; i += 1) {
    if (bytes[i] !== magic[i]) {
      return false;
    }
  }
  return true;
}

export function readPtbackupFormatVersion(payload: Uint8Array): number {
  if (!matchesMagic(payload, PTBACKUP_MAGIC)) {
    throw new Error('invalid_ptbackup_header');
  }
  return readU16(payload, PTBACKUP_MAGIC.length);
}

export function readPtshareFormatVersion(payload: Uint8Array): number {
  if (!matchesMagic(payload, PTSHARE_MAGIC)) {
    throw new Error('invalid_ptshare_header');
  }
  return readU16(payload, PTSHARE_MAGIC.length);
}

export const __test__ = {
  PTBACKUP_MAGIC,
  PTSHARE_MAGIC,
};
