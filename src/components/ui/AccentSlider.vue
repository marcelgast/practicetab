<script setup lang="ts">
import { computed } from 'vue';
import { SliderRange, SliderRoot, SliderThumb, SliderTrack } from 'reka-ui';

type AccentSliderProps = {
  modelValue: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  orientation?: 'horizontal' | 'vertical';
  ariaLabel?: string;
};

const props = withDefaults(defineProps<AccentSliderProps>(), {
  min: 0,
  max: 100,
  step: 1,
  disabled: false,
  orientation: 'horizontal',
  ariaLabel: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [number];
}>();

const internalValue = computed({
  get: () => [props.modelValue],
  set: (value: number[] | null | undefined) => {
    const nextValue = Array.isArray(value) ? value[0] : value;
    emit(
      'update:modelValue',
      typeof nextValue === 'number' ? nextValue : props.modelValue,
    );
  },
});
</script>

<template>
  <SliderRoot
    v-model="internalValue"
    class="accent-slider"
    :class="{
      'accent-slider--vertical': props.orientation === 'vertical',
    }"
    :min="min"
    :max="max"
    :step="step"
    :disabled="disabled"
    :orientation="props.orientation"
    :aria-label="props.ariaLabel"
  >
    <SliderTrack class="accent-slider__track">
      <SliderRange class="accent-slider__range" />
    </SliderTrack>
    <SliderThumb class="accent-slider__thumb" />
  </SliderRoot>
</template>

<style scoped>
.accent-slider {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 100%;
  height: 20px;
  touch-action: none;
  user-select: none;
}

.accent-slider__track {
  position: relative;
  flex: 1;
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.16);
  border-radius: 999px;
}

.accent-slider__range {
  position: absolute;
  height: 100%;
  background: var(--accent);
  border-radius: 999px;
}

.accent-slider__thumb {
  position: absolute;
  top: 50%;
  margin-top: -6px;
  display: block;
  width: 12px;
  height: 12px;
  background: #1b1f2a;
  border: 2px solid var(--accent);
  border-radius: 50%;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
}

.accent-slider__thumb:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.accent-slider--vertical {
  flex-direction: column;
  width: 18px;
  height: 120px;
}

.accent-slider--vertical .accent-slider__track {
  width: 4px;
  height: 100%;
}

.accent-slider--vertical .accent-slider__thumb {
  top: auto;
  left: 50%;
  margin-top: 0;
  margin-left: -6px;
}

.accent-slider[data-disabled] {
  opacity: 0.5;
}
</style>
