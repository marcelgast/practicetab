<script setup lang="ts">
import BaseButton from '../ui/BaseButton.vue';

defineProps<{
  open: boolean;
  titleId: string;
  title: string;
  message: string;
  buttonText?: string;
}>();

const emit = defineEmits<{
  close: [];
}>();
</script>

<template>
  <div
    v-if="open"
    class="warning-overlay"
    role="dialog"
    aria-modal="true"
    :aria-labelledby="titleId"
  >
    <div class="warning-modal">
      <h2 :id="titleId">
        {{ title }}
      </h2>
      <p>{{ message }}</p>
      <BaseButton
        variant="filled-accent"
        size="sm"
        @click="emit('close')"
      >
        {{ buttonText ?? 'Close' }}
      </BaseButton>
    </div>
  </div>
</template>

<style scoped>
.warning-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-backdrop);
  display: grid;
  place-items: center;
  z-index: 10040;
}

.warning-modal {
  width: min(520px, calc(100% - 32px));
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 12px;
  padding: 18px;
  background: var(--modal-surface);
  display: grid;
  gap: 14px;
  text-align: center;
  justify-items: center;
}

.warning-modal h2 {
  margin: 0;
  font-size: 1rem;
}

.warning-modal p {
  margin: 10px 0 14px;
  color: var(--text-muted);
  line-height: 1.45;
  text-align: center;
}
</style>
