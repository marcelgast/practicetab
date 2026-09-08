<script setup lang="ts">
import BaseButton from './BaseButton.vue';

type ToggleButtonProps = {
  pressed?: boolean;
  variant?: 'primary' | 'ghost';
  size?: 'sm' | 'md';
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
};

withDefaults(defineProps<ToggleButtonProps>(), {
  pressed: false,
  variant: 'ghost',
  size: 'md',
  type: 'button',
  disabled: false,
});
</script>

<template>
  <BaseButton
    class="toggle-button"
    :class="[size, { pressed }]"
    :variant="variant"
    :type="type"
    :disabled="disabled"
    :aria-pressed="pressed"
  >
    <slot />
  </BaseButton>
</template>

<style scoped>
.toggle-button.pressed {
  border-color: var(--accent);
  color: var(--accent);
  background: transparent;
}
</style>
