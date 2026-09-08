import type { PtDataEnvelopeV1 } from '../../domain/ptdata';
import { backupFileOps } from '../backupFileOps';
import { fromBase64, toBase64 } from '../backupCrypto';

const MAGIC = new TextEncoder().encode('PTSH');
const FORMAT_VERSION = 1;

function writeU16(target: number[], value: number): void {
  target.push((value >> 8) & 0xff, value & 0xff);
}

function readU16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

export function encodePtShareEnvelope(envelope: PtDataEnvelopeV1): Uint8Array {
  const payload = new TextEncoder().encode(JSON.stringify(envelope));
  const bytes: number[] = [];
  MAGIC.forEach((value) => bytes.push(value));
  writeU16(bytes, FORMAT_VERSION);
  payload.forEach((value) => bytes.push(value));
  return Uint8Array.from(bytes);
}

export function decodePtShareEnvelope(payload: Uint8Array): PtDataEnvelopeV1 {
  if (payload.length < MAGIC.length + 2) {
    throw new Error('invalid_share_file');
  }
  for (let i = 0; i < MAGIC.length; i += 1) {
    if (payload[i] !== MAGIC[i]) {
      throw new Error('invalid_share_file');
    }
  }
  let offset = MAGIC.length;
  const version = readU16(payload, offset);
  offset += 2;
  if (version !== FORMAT_VERSION) {
    throw new Error('unsupported_share_version');
  }
  const jsonBytes = payload.slice(offset);
  const json = new TextDecoder().decode(jsonBytes);
  return JSON.parse(json) as PtDataEnvelopeV1;
}

export async function writePtShareFile(
  envelope: PtDataEnvelopeV1,
  path: string,
): Promise<void> {
  const bytes = encodePtShareEnvelope(envelope);
  await backupFileOps.writeFileBase64(path, toBase64(bytes));
}

export async function readPtShareFile(path: string): Promise<PtDataEnvelopeV1> {
  const base64 = await backupFileOps.readFileBase64(path);
  const bytes = fromBase64(base64);
  return decodePtShareEnvelope(bytes);
}

export const __test__ = {
  MAGIC,
  FORMAT_VERSION,
};
