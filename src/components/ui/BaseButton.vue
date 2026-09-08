<script setup lang="ts">
type BaseButtonProps = {
  variant?:
    | 'primary'
    | 'ghost'
    | 'outline-accent'
    | 'outline-danger'
    | 'filled-accent'
    | 'filled-danger';
  size?: 'sm' | 'md';
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
};

withDefaults(defineProps<BaseButtonProps>(), {
  variant: 'ghost',
  size: 'md',
  type: 'button',
  disabled: false,
});
</script>

<template>
  <button
    class="base-button"
    :class="[variant, size]"
    :type="type"
    :disabled="disabled"
  >
    <slot />
  </button>
</template>

<style scoped>
.base-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition:
    background 120ms ease,
    border-color 120ms ease,
    color 120ms ease;
}

.base-button.sm {
  height: 28px;
  padding: 0 10px;
  font-size: 0.78rem;
}

.base-button.md {
  height: 34px;
  padding: 0 12px;
  font-size: 0.85rem;
}

.base-button.ghost {
  background: transparent;
}

.base-button.ghost:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text);
}

.base-button.outline-accent {
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
  font-size: 0.95rem;
  line-height: 1;
}

.base-button.outline-accent:hover:not(:disabled) {
  background: rgba(93, 214, 162, 0.08);
}

.base-button.outline-danger {
  border-color: #ff7b7b;
  color: #ff7b7b;
  font-weight: 600;
}

.base-button.outline-danger:hover:not(:disabled) {
  background: rgba(255, 123, 123, 0.12);
  color: #2a0b0b;
}

.base-button.filled-accent {
  background: var(--accent);
  border-color: transparent;
  color: #0b0e13;
  font-weight: 700;
}

.base-button.filled-accent:hover:not(:disabled) {
  filter: brightness(1.05);
}

.base-button.filled-danger {
  background: #ff8b8b;
  border-color: transparent;
  color: #2a0b0b;
  font-weight: 700;
  padding-inline: 8px;
}

.base-button.filled-danger:hover:not(:disabled) {
  filter: brightness(1.05);
}

.base-button.primary {
  background: var(--accent);
  border-color: transparent;
  color: #0f1117;
}

.base-button.primary:hover:not(:disabled) {
  filter: brightness(1.05);
}

.base-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.base-button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
