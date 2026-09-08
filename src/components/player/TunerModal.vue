<script setup lang="ts">
/**
 * Minimal tuner modal.
 *
 * Layout:
 * - Header with title and close button.
 * - Body: -50 / +50 labels above a horizontal line with a single dot
 *   indicator driven by `barPosition`. The detected note name is
 *   rendered large above the dot and the cent offset below it.
 * - Footer: a small A4 reference input pinned to the bottom-right.
 *
 * No tuning preset selector, no live-toggle, no cents/Hz switch —
 * keeping the surface intentionally small per feedback.
 */
import { computed, ref, watch } from 'vue';
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui';
import { X } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { usePitchTunerStore } from '../../stores/tuner';
import {
  REFERENCE_A4_MAX_HZ,
  REFERENCE_A4_MIN_HZ,
  parseReferenceA4,
} from '../../domain/tuner';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ 'update:open': [value: boolean] }>();

const tunerStore = usePitchTunerStore();
const { currentNote, centsOffset, accuracy, barPosition, referenceA4 } =
  storeToRefs(tunerStore);

const referenceDraft = ref<string>(referenceA4.value.toString());
const referenceError = ref<string | null>(null);

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      referenceDraft.value = referenceA4.value.toString();
      referenceError.value = null;
    }
  },
);

watch(referenceA4, (value) => {
  const active = document.activeElement as HTMLElement | null;
  if (active?.dataset?.tunerReference === 'true') return;
  referenceDraft.value = value.toString();
});

function commitReference(): void {
  const parsed = parseReferenceA4(referenceDraft.value);
  if (parsed === null) {
    referenceError.value = `${REFERENCE_A4_MIN_HZ}–${REFERENCE_A4_MAX_HZ} Hz`;
    return;
  }
  referenceError.value = null;
  tunerStore.setReferenceA4(parsed);
  referenceDraft.value = parsed.toString();
}

function handleReferenceKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    event.preventDefault();
    (event.target as HTMLInputElement).blur();
  }
}

function handleOpenChange(value: boolean): void {
  emit('update:open', value);
}

const hasReading = computed(() => currentNote.value !== '');

const centsLabel = computed(() => {
  if (!hasReading.value) return '';
  const rounded = Math.round(centsOffset.value);
  if (rounded === 0) return '0';
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded}`;
});

const indicatorStyle = computed(() => ({
  left: `${(barPosition.value * 100).toFixed(2)}%`,
}));
</script>

<template>
  <DialogRoot
    :open="open"
    @update:open="handleOpenChange"
  >
    <DialogPortal>
      <DialogOverlay class="tuner-modal-overlay">
        <DialogContent class="tuner-modal">
          <header class="tuner-modal-header">
            <DialogTitle class="tuner-modal-title">
              Tuner
            </DialogTitle>
            <button
              class="tuner-modal-close"
              type="button"
              aria-label="Close tuner"
              @click="handleOpenChange(false)"
            >
              <X :size="20" />
            </button>
          </header>

          <div
            class="tuner-modal-body"
            :class="[`is-${accuracy}`, { 'is-silent': !hasReading }]"
          >
            <div class="tuner-modal-scale">
              <span class="tuner-modal-scale-label">-50</span>
              <span class="tuner-modal-note">
                {{ hasReading ? currentNote : '—' }}
              </span>
              <span class="tuner-modal-scale-label">+50</span>
            </div>
            <div class="tuner-modal-track">
              <span
                class="tuner-modal-center-mark"
                aria-hidden="true"
              />
              <span
                class="tuner-modal-indicator"
                :style="indicatorStyle"
                aria-hidden="true"
              />
            </div>
            <div
              class="tuner-modal-cents"
              aria-live="polite"
            >
              {{ centsLabel }}
            </div>
          </div>

          <footer class="tuner-modal-footer">
            <label class="tuner-modal-reference">
              <span class="tuner-modal-reference-label">A4</span>
              <input
                v-model="referenceDraft"
                class="tuner-modal-reference-input"
                type="text"
                inputmode="decimal"
                spellcheck="false"
                autocomplete="off"
                data-tuner-reference="true"
                :aria-invalid="referenceError !== null"
                :title="referenceError ?? 'A4 reference in Hz'"
                @blur="commitReference"
                @keydown="handleReferenceKeydown"
              >
              <span class="tuner-modal-reference-unit">Hz</span>
            </label>
          </footer>
        </DialogContent>
      </DialogOverlay>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.tuner-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.tuner-modal {
  background: #11131a;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  width: min(640px, 100%);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
  color: var(--text);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tuner-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.tuner-modal-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
}

.tuner-modal-close {
  background: transparent;
  border: 0;
  color: var(--text-muted);
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition:
    color 0.15s ease,
    background-color 0.15s ease;
}

.tuner-modal-close:hover,
.tuner-modal-close:focus-visible {
  color: var(--text);
  background: rgba(255, 255, 255, 0.06);
  outline: none;
}

.tuner-modal-body {
  position: relative;
  /* Fixed height so row toggles inside can never resize the modal
     and shove the overlay around. Content is pinned to the top via
     padding — NOT flex-centered — so sub-pixel height variance in a
     child can't re-center the whole column and make everything hop. */
  height: 280px;
  padding: 72px 48px 48px;
  display: block;
}

.tuner-modal-scale {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--text-muted);
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
  /* Lock the row height so the short ±50 labels don't collapse it
     when the note text is briefly empty. */
  height: 3rem;
}

.tuner-modal-note {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 3rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.02em;
  color: var(--text);
  transition: color 0.2s ease;
}

.tuner-modal-body.is-perfect .tuner-modal-note {
  color: #4ade80;
}

.tuner-modal-body.is-silent .tuner-modal-note {
  color: var(--text-muted);
}

.tuner-modal-track {
  position: relative;
  height: 2px;
  background: rgba(255, 255, 255, 0.65);
  border-radius: 1px;
  margin: 40px 0 22px;
}

.tuner-modal-center-mark {
  position: absolute;
  top: -6px;
  bottom: -6px;
  left: 50%;
  width: 2px;
  margin-left: -1px;
  background: rgba(255, 255, 255, 0.35);
  border-radius: 1px;
}

.tuner-modal-indicator {
  position: absolute;
  top: 50%;
  width: 36px;
  height: 36px;
  margin-top: -18px;
  margin-left: -18px;
  border-radius: 999px;
  background: #5a5f6b;
  border: 0;
  transition:
    background-color 0.15s ease,
    box-shadow 0.15s ease;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
}

.tuner-modal-body.is-perfect .tuner-modal-indicator {
  background: #4ade80;
  box-shadow: 0 0 18px color-mix(in srgb, #4ade80 55%, transparent);
}

.tuner-modal-body.is-silent .tuner-modal-indicator {
  box-shadow: none;
}

.tuner-modal-cents {
  text-align: center;
  color: var(--text-muted);
  font-size: 0.95rem;
  font-variant-numeric: tabular-nums;
  min-height: 1.2rem;
}

.tuner-modal-footer {
  display: flex;
  justify-content: flex-end;
  padding: 10px 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.tuner-modal-reference {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.72rem;
  color: var(--text-muted);
}

.tuner-modal-reference-label {
  font-weight: 600;
  letter-spacing: 0.04em;
}

.tuner-modal-reference-input {
  width: 64px;
  padding: 4px 6px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: #0f121a;
  color: var(--text);
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.tuner-modal-reference-input:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 70%, transparent);
  outline-offset: 1px;
}

.tuner-modal-reference-input[aria-invalid='true'] {
  border-color: color-mix(in srgb, #f87171 60%, transparent);
}

.tuner-modal-reference-unit {
  letter-spacing: 0.04em;
}
</style>
