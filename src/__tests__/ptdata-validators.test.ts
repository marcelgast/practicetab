// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  __test__,
  readPtbackupFormatVersion,
  readPtshareFormatVersion,
} from '../services/ptdata/validators';

describe('ptdata validators', () => {
  it('reads ptshare format version from header', () => {
    const payload = new Uint8Array([...__test__.PTSHARE_MAGIC, 0, 1, 1]);
    expect(readPtshareFormatVersion(payload)).toBe(1);
  });

  it('reads ptbackup format version from header', () => {
    const payload = new Uint8Array([...__test__.PTBACKUP_MAGIC, 0, 1, 1]);
    expect(readPtbackupFormatVersion(payload)).toBe(1);
  });

  it('throws on invalid ptshare header', () => {
    const payload = new Uint8Array([0, 0, 0, 0, 0, 1]);
    expect(() => readPtshareFormatVersion(payload)).toThrow(
      'invalid_ptshare_header',
    );
  });
});
