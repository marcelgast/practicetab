import { describe, expect, it, vi } from 'vitest';
import { computeTauriIdentifier } from '../../scripts/version-utils.mjs';

describe('computeTauriIdentifier', () => {
  it('uses base identifier for non-dev versions', () => {
    expect(computeTauriIdentifier('0.1.2', {})).toBe('practicetab');
  });

  it('uses stable devtest identifier for dev-test versions', () => {
    expect(computeTauriIdentifier('0.1.2-dev-test', {})).toBe(
      'practicetab.devtest',
    );
  });

  it('supports devtest suffix for clean data isolation', () => {
    expect(
      computeTauriIdentifier('0.1.2-dev-test', {
        PT_DEVTEST_ID_SUFFIX: 'clean',
      }),
    ).toBe('practicetab.devtest.clean');
  });

  it('forces devtest identifier when PT_DEVTEST_ID is set', () => {
    expect(
      computeTauriIdentifier('0.1.2', {
        PT_DEVTEST_ID: '1',
      }),
    ).toBe('practicetab.devtest');
  });

  it('uses a stamped identifier only when explicitly requested', () => {
    vi.spyOn(Date, 'now').mockReturnValue(123456);
    expect(
      computeTauriIdentifier('0.1.2-dev-test', {
        PT_DEVTEST_ID_STAMP: '1',
      }),
    ).toBe('practicetab.devtest.0.1.2-dev-test.123456');
    vi.restoreAllMocks();
  });
});
