<script setup lang="ts">
/**
 * iOS-style on/off switch for Settings rows. Matches the app's
 * accent theme, keeps full keyboard + screen-reader accessibility
 * via an underlying native `input[type="checkbox"]` that stays
 * visually hidden but remains in the focus order.
 *
 * Consistent surface for "boolean setting" rows so Include Tab /
 * Include Audio / Journaling and future flags all render the same.
 */
type SwitchProps = {
  modelValue: boolean;
  disabled?: boolean;
  ariaLabel?: string;
};

const props = withDefaults(defineProps<SwitchProps>(), {
  disabled: false,
  ariaLabel: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [next: boolean];
}>();

function onChange(event: Event): void {
  if (props.disabled) return;
  const next = (event.target as HTMLInputElement).checked;
  emit('update:modelValue', next);
}
</script>

<template>
  <label
    class="settings-switch"
    :class="{ on: modelValue, disabled }"
  >
    <input
      type="checkbox"
      class="settings-switch-input"
      :checked="modelValue"
      :disabled="disabled"
      :aria-label="ariaLabel"
      @change="onChange"
    >
    <span
      class="settings-switch-track"
      aria-hidden="true"
    >
      <span class="settings-switch-thumb" />
    </span>
  </label>
</template>

<style scoped>
.settings-switch {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  user-select: none;
}

.settings-switch.disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.settings-switch-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.settings-switch-track {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid var(--border);
  transition:
    background 140ms ease,
    border-color 140ms ease;
}

.settings-switch-thumb {
  position: absolute;
  top: 1px;
  left: 1px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #e6e6ea;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  transition: transform 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.settings-switch.on .settings-switch-track {
  background: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 80%, transparent);
}

.settings-switch.on .settings-switch-thumb {
  transform: translateX(16px);
  background: #0b0e13;
}

.settings-switch-input:focus-visible + .settings-switch-track {
  outline: 2px solid color-mix(in srgb, var(--accent) 70%, transparent);
  outline-offset: 2px;
}
</style>
