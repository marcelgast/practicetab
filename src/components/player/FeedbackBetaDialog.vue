<script setup lang="ts">
/**
 * Beta-disclaimer modal shown the first time the user turns Feedback on
 * in a session. Frames Feedback as an exam-style progress check rather
 * than an always-on guitar teacher, points users at the homepage to
 * report issues, and lets them pick a difficulty preset before they
 * start.
 *
 * Acknowledgement lives in `feedbackBetaAck.ts` as a module-level ref
 * (not persisted) so the modal reappears after an app restart — the
 * disclaimer is important enough to re-surface once per launch.
 *
 * Difficulty is backed by the noteRecognition store's
 * `strictnessPreset`, which is already persisted to localStorage by
 * `setStrictness` — flipping the option here updates the setting for
 * every future run automatically.
 */
import { computed } from 'vue';
import { openUrl } from '@tauri-apps/plugin-opener';
import BaseButton from '../ui/BaseButton.vue';
import { feedbackBetaAcknowledged } from './feedbackBetaAck';
import { isTauri as isTauriRuntime } from '../../services/libraryFileOps';
import { useNoteRecognitionStore } from '../../stores/noteRecognition';
import type { StrictnessPreset } from '../../domain/noteComparison';

const HOMEPAGE_URL = 'https://getpracticetab.com';

interface DifficultyOption {
  value: StrictnessPreset;
  label: string;
  help: string;
}

const DIFFICULTY_OPTIONS: readonly DifficultyOption[] = [
  {
    value: 'beginner',
    label: 'Beginner',
    help: 'Very forgiving. Great for learning a new piece — hit the right note in the general area and you get credit.',
  },
  {
    value: 'intermediate',
    label: 'Intermediate',
    help: 'The sweet spot. Reasonable tolerance for pitch and timing — the target level for regular practice.',
  },
  {
    value: 'pro',
    label: 'Pro',
    help: 'Tight windows. You need to be on the note and on the beat. Use once a piece is locked in.',
  },
] as const;

const recognitionStore = useNoteRecognitionStore();

defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  acknowledge: [];
  close: [];
}>();

const selectedDifficulty = computed<StrictnessPreset>(
  () => recognitionStore.strictnessPreset,
);

function selectDifficulty(preset: StrictnessPreset): void {
  // Routes through the store so the pick is persisted via its
  // `setStrictness` → localStorage path. Takes effect on the next
  // `startComparison` — which is exactly when the user clicks
  // "Start", so the disclaimer's choice always applies to this run.
  recognitionStore.setStrictness(preset);
}

function onStart(): void {
  feedbackBetaAcknowledged.value = true;
  emit('acknowledge');
}

async function openHomepage(): Promise<void> {
  // Tauri webview blocks naked anchor navigation; route through the
  // opener plugin so the URL lands in the user's default browser, with
  // a `window.open` fallback for the non-Tauri test environment.
  try {
    if (isTauriRuntime()) {
      await openUrl(HOMEPAGE_URL);
    } else {
      window.open(HOMEPAGE_URL, '_blank', 'noopener,noreferrer');
    }
  } catch {
    window.open(HOMEPAGE_URL, '_blank', 'noopener,noreferrer');
  }
}
</script>

<template>
  <div
    v-if="open"
    class="beta-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="feedback-beta-title"
    @click.self="emit('close')"
  >
    <div class="beta-modal">
      <header class="beta-header">
        <h2 id="feedback-beta-title">
          Feedback
        </h2>
        <span
          class="beta-flag"
          aria-label="Beta feature"
        >Beta</span>
      </header>

      <aside
        class="beta-notice"
        role="note"
        aria-label="Important usage note"
      >
        <span class="beta-notice-title">Best for single exercises, not full songs.</span>
        <span class="beta-notice-body">
          Feedback is designed to tell you whether you're playing a short
          passage correctly. On a whole song the calls can be less precise —
          chords, fast runs, and overlapping notes blend into the pitch signal.
          Isolate the bar you're drilling for the most reliable results.
        </span>
      </aside>

      <p class="beta-lead">
        Live Feedback is a new feature and still in beta. It's
        <strong>not designed to run always-on</strong> — think of it as an
        occasional exam to check your progress on a piece, not a constant judge
        on your shoulder.
      </p>

      <p class="beta-detail">
        For the cleanest signal, use an <strong>audio interface</strong> with
        your guitar plugged in directly — laptop mics pick up room noise and
        lose quiet playing in the floor. Pick the device (and input channel if
        your interface has more than one) under
        <strong>Settings → Audio</strong>.
      </p>

      <p class="beta-detail">
        Your feedback makes this feature better. If you notice something off —
        misread pitch, bad timing calls, wrong colour on a note — please report
        it through the form on
        <a
          :href="HOMEPAGE_URL"
          class="beta-link"
          @click.prevent="openHomepage"
        >our homepage</a>. Every report helps refine what counts as &ldquo;correct&rdquo;.
      </p>

      <section
        class="beta-difficulty"
        aria-labelledby="feedback-beta-difficulty-title"
      >
        <h3 id="feedback-beta-difficulty-title">
          Difficulty
        </h3>
        <div
          class="difficulty-options"
          role="radiogroup"
          aria-labelledby="feedback-beta-difficulty-title"
        >
          <button
            v-for="opt in DIFFICULTY_OPTIONS"
            :key="opt.value"
            type="button"
            role="radio"
            class="difficulty-option"
            :class="{ 'is-selected': selectedDifficulty === opt.value }"
            :aria-checked="selectedDifficulty === opt.value"
            @click="selectDifficulty(opt.value)"
          >
            <span class="difficulty-label">{{ opt.label }}</span>
            <span class="difficulty-help">{{ opt.help }}</span>
          </button>
        </div>
      </section>

      <footer class="beta-actions">
        <BaseButton
          variant="filled-accent"
          size="sm"
          type="button"
          @click="onStart"
        >
          Start
        </BaseButton>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.beta-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-backdrop);
  display: grid;
  place-items: center;
  /* Sits above the AppLayout chrome (z-index 100000) so the modal
     is guaranteed clickable regardless of what else is on screen. */
  z-index: 100002;
}

.beta-modal {
  width: min(640px, calc(100% - 32px));
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 12px;
  padding: 22px 22px 18px;
  background: var(--modal-surface);
  display: grid;
  gap: 14px;
  color: var(--text);
}

.beta-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.beta-header h2 {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--text);
}

.beta-flag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent);
  border: 1px solid var(--accent);
  border-radius: 999px;
  line-height: 1;
  /* Tiny shift keeps the pill visually centred with the h2 baseline. */
  transform: translateY(1px);
}

.beta-notice {
  /* Prominent accent-bordered callout at the very top of the modal.
     Stronger visual weight than .beta-lead so the "single exercises,
     not full songs" guidance can't be missed — this is the most
     common source of user confusion about what the feature does. */
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--accent);
  border-left-width: 3px;
  border-radius: 8px;
  background: rgba(var(--accent-rgb, 34, 197, 94), 0.08);
}

.beta-notice-title {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--accent);
  line-height: 1.35;
}

.beta-notice-body {
  font-size: 0.82rem;
  line-height: 1.5;
  color: var(--text);
}

.beta-lead {
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.5;
}

.beta-detail {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.86rem;
  line-height: 1.55;
}

.beta-link {
  color: var(--accent);
  text-decoration: underline;
  cursor: pointer;
}

.beta-link:hover {
  text-decoration: none;
}

.beta-link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 2px;
}

.beta-difficulty {
  display: grid;
  gap: 8px;
  margin-top: 2px;
}

.beta-difficulty h3 {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.difficulty-options {
  display: grid;
  gap: 6px;
}

.difficulty-option {
  appearance: none;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 10px 12px;
  text-align: left;
  cursor: pointer;
  display: grid;
  gap: 2px;
  color: inherit;
  font: inherit;
  transition:
    border-color 120ms ease,
    background-color 120ms ease;
}

.difficulty-option:hover {
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.05);
}

.difficulty-option.is-selected {
  border-color: var(--accent);
  background: rgba(var(--accent-rgb, 34, 197, 94), 0.08);
}

.difficulty-option:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.difficulty-label {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text);
}

.difficulty-option.is-selected .difficulty-label {
  color: var(--accent);
}

.difficulty-help {
  font-size: 0.78rem;
  line-height: 1.4;
  color: var(--text-muted);
}

.beta-actions {
  margin-top: 2px;
  display: flex;
  justify-content: flex-end;
}
</style>
