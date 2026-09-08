// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { decodeBackupFile, encodeBackupFile } from '../services/backupCrypto';

describe('backup crypto (v2 plaintext)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('roundtrips plaintext payloads through the PTBK v2 wrapper', async () => {
    const plaintext = new TextEncoder().encode('ptbackup test payload');

    const wrapped = await encodeBackupFile(plaintext);
    const decoded = await decodeBackupFile(wrapped);

    expect(Array.from(decoded)).toEqual(Array.from(plaintext));
  });

  it('rejects payloads without the PTBK magic header', async () => {
    const notABackup = new TextEncoder().encode('random garbage');
    await expect(decodeBackupFile(notABackup)).rejects.toThrow(
      /invalid_backup_file/,
    );
  });

  it('rejects future format versions with a clear error', async () => {
    // Manually craft a payload claiming to be v999 so we can prove
    // the decoder refuses it rather than mis-parsing.
    const magic = new TextEncoder().encode('PTBK');
    const payload = new Uint8Array(magic.length + 2);
    payload.set(magic, 0);
    payload[magic.length] = 0x03;
    payload[magic.length + 1] = 0xe7;
    await expect(decodeBackupFile(payload)).rejects.toThrow(
      /unsupported_backup_version/,
    );
  });
});

describe('backup crypto (v1 legacy decrypt fallback)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('surfaces legacy_backup_needs_license_key when no license key is cached', async () => {
    // A minimally-well-formed v1 header. We only need to prove the
    // decoder actually enters the v1 branch and bails out on the
    // missing key — not that it decrypts anything.
    const magic = new TextEncoder().encode('PTBK');
    const header: number[] = [];
    magic.forEach((b) => header.push(b));
    header.push(0x00, 0x01);
    header.push(0x00, 0x10);
    for (let i = 0; i < 0x10; i += 1) header.push(0);
    header.push(0, 0, 0x80, 0);
    header.push(0, 0, 0, 8);
    header.push(0, 0, 0, 1);
    header.push(0x00, 0x0c);
    for (let i = 0; i < 0x0c; i += 1) header.push(0);
    header.push(0, 0, 0, 0);
    const payload = Uint8Array.from(header);
    await expect(decodeBackupFile(payload)).rejects.toThrow(
      /legacy_backup_needs_license_key/,
    );
  });
});
