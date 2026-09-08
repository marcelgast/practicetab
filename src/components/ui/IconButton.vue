<script setup lang="ts">
import BaseButton from './BaseButton.vue';

type IconButtonProps = {
  variant?: 'primary' | 'ghost';
  size?: 'sm' | 'md';
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
};

withDefaults(defineProps<IconButtonProps>(), {
  variant: 'ghost',
  size: 'md',
  type: 'button',
  disabled: false,
});
</script>

<template>
  <BaseButton
    class="icon-button"
    :class="size"
    :variant="variant"
    :type="type"
    :disabled="disabled"
  >
    <slot />
  </BaseButton>
</template>

<style scoped>
.icon-button {
  padding: 0;
  width: 34px;
  height: 34px;
  min-width: 34px;
}

.icon-button.sm {
  width: 28px;
  height: 28px;
  min-width: 28px;
}

.icon-button :deep(svg) {
  width: 20px;
  height: 20px;
}
</style>
