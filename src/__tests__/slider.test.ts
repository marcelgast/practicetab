import { describe, expect, it } from 'vitest';
import { fromSliderValues, toSliderValues } from '../domain/slider';
import { computed, ref } from 'vue';

describe('slider mapping', () => {
  it('wraps model value in array', () => {
    expect(toSliderValues(80, 0)).toEqual([80]);
  });

  it('falls back when model value is invalid', () => {
    expect(toSliderValues(Number.NaN, 10)).toEqual([10]);
  });

  it('unwraps slider array value', () => {
    expect(fromSliderValues([55], 0)).toBe(55);
  });

  it('falls back when slider value is invalid', () => {
    expect(fromSliderValues(null, 20)).toBe(20);
    expect(fromSliderValues([Number.NaN], 30)).toBe(30);
  });
});

describe('accent slider binding', () => {
  it('wraps modelValue in array', () => {
    const modelValue = ref(80);
    const valueArr = computed({
      get: () => [modelValue.value],
      set: (value: number[] | null | undefined) => {
        modelValue.value = Array.isArray(value) ? value[0] : Number(value);
      },
    });

    expect(valueArr.value).toEqual([80]);
  });

  it('emits single value from array update', () => {
    const modelValue = ref(80);
    const valueArr = computed({
      get: () => [modelValue.value],
      set: (value: number[] | null | undefined) => {
        modelValue.value = Array.isArray(value) ? value[0] : Number(value);
      },
    });

    valueArr.value = [50];
    expect(modelValue.value).toBe(50);
  });
});
