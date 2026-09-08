<script setup lang="ts">
import AppTooltip from './AppTooltip.vue';

type SplitToggleProps = {
  leftPressed: boolean;
  rightPressed: boolean;
  leftLabel: string;
  rightLabel: string;
  disabled?: boolean;
  leftTooltip?: string;
  rightTooltip?: string;
};

const props = withDefaults(defineProps<SplitToggleProps>(), {
  disabled: false,
  leftTooltip: undefined,
  rightTooltip: undefined,
});

const emit = defineEmits<{
  (event: 'toggle-left'): void;
  (event: 'toggle-right'): void;
}>();
</script>

<template>
  <div
    class="split-toggle"
    :class="{ disabled: props.disabled }"
  >
    <AppTooltip
      v-if="props.leftTooltip"
      :text="props.leftTooltip"
    >
      <button
        class="split-toggle__segment"
        :class="{ active: props.leftPressed }"
        type="button"
        :disabled="props.disabled"
        :aria-pressed="props.leftPressed"
        :aria-label="props.leftLabel"
        @click="emit('toggle-left')"
      >
        <slot name="left" />
      </button>
    </AppTooltip>
    <button
      v-else
      class="split-toggle__segment"
      :class="{ active: props.leftPressed }"
      type="button"
      :disabled="props.disabled"
      :aria-pressed="props.leftPressed"
      :aria-label="props.leftLabel"
      @click="emit('toggle-left')"
    >
      <slot name="left" />
    </button>
    <span class="split-toggle__divider" />
    <AppTooltip
      v-if="props.rightTooltip"
      :text="props.rightTooltip"
    >
      <button
        class="split-toggle__segment"
        :class="{ active: props.rightPressed }"
        type="button"
        :disabled="props.disabled"
        :aria-pressed="props.rightPressed"
        :aria-label="props.rightLabel"
        @click="emit('toggle-right')"
      >
        <slot name="right" />
      </button>
    </AppTooltip>
    <button
      v-else
      class="split-toggle__segment"
      :class="{ active: props.rightPressed }"
      type="button"
      :disabled="props.disabled"
      :aria-pressed="props.rightPressed"
      :aria-label="props.rightLabel"
      @click="emit('toggle-right')"
    >
      <slot name="right" />
    </button>
  </div>
</template>

<style scoped>
.split-toggle {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: transparent;
  overflow: hidden;
}

.split-toggle__segment {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 36px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition:
    color 120ms ease,
    background 120ms ease;
}

.split-toggle__segment:hover:not(:disabled) {
  color: var(--text);
}

.split-toggle__segment.active {
  color: var(--accent);
  background: rgba(93, 214, 162, 0.12);
}

.split-toggle__segment:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.split-toggle__divider {
  width: 1px;
  height: 60%;
  background: var(--border);
}

.split-toggle.disabled {
  opacity: 0.45;
}

.split-toggle.disabled .split-toggle__segment {
  cursor: not-allowed;
}
</style>
