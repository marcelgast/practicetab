<script setup lang="ts">
/**
 * Single-slot toast renderer for `useToastStore`. Mounted once in
 * `App.vue`; its visibility is driven entirely by the store's
 * `current` ref. Pointer-events stay disabled while nothing is
 * shown so the toast never blocks clicks underneath.
 *
 * aria-live="polite" is set on the container so screen readers
 * pick up completion messages without interrupting the user.
 */
import { computed } from 'vue';
import { useToastStore } from '../../stores/toast';

const toastStore = useToastStore();

const toast = computed(() => toastStore.current);
</script>

<template>
  <Teleport to="body">
    <div
      class="app-toast-region"
      aria-live="polite"
      aria-atomic="true"
    >
      <Transition name="app-toast">
        <div
          v-if="toast"
          :key="toast.id"
          class="app-toast"
          :class="`app-toast--${toast.variant}`"
          role="status"
        >
          <span class="app-toast-message">{{ toast.message }}</span>
          <button
            type="button"
            class="app-toast-dismiss"
            aria-label="Dismiss notification"
            @click="toastStore.dismiss()"
          >
            ×
          </button>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<style scoped>
.app-toast-region {
  position: fixed;
  left: 50%;
  bottom: 88px;
  transform: translateX(-50%);
  display: flex;
  justify-content: center;
  pointer-events: none;
  z-index: 10100;
}

.app-toast {
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  max-width: min(480px, calc(100vw - 32px));
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--modal-surface, #11161f);
  color: var(--text, #f5f5f7);
  border: 1px solid color-mix(in srgb, var(--accent) 55%, transparent);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.4);
  font-size: 0.88rem;
}

.app-toast--success {
  border-left: 3px solid var(--accent);
}

.app-toast--info {
  border-left: 3px solid color-mix(in srgb, var(--text-muted) 60%, transparent);
}

.app-toast-message {
  flex: 1 1 auto;
  line-height: 1.4;
}

.app-toast-dismiss {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  padding: 0;
  /* Grid layout centers the "×" glyph optically — a naive
   * inline-flex button left it slightly below the text baseline
   * because the character has more bottom space than top. */
  display: grid;
  place-items: center;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--accent);
  font-size: 1.05rem;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
}

.app-toast-dismiss:hover {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}

.app-toast-enter-active,
.app-toast-leave-active {
  transition:
    opacity 160ms ease,
    transform 160ms ease;
}

.app-toast-enter-from,
.app-toast-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
