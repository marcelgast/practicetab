<script setup lang="ts">
/**
 * Right-hand column of the Help dropdown. Lists every guide with
 * a completion dot (○/✓) and a Take/Retake button, plus the
 * `Show at startup` toggle that controls whether the Welcome
 * dialog re-appears on future launches.
 *
 * Taking a guide starts the runner and asks the parent dropdown
 * to close so the spotlight can land on the real page controls
 * (driver.js will otherwise try to highlight a target that's
 * underneath our open dropdown).
 *
 * Dropdown height is bounded by `ShortcutsHelpMenu` — the guides
 * list itself scrolls internally so the shortcuts column never
 * gets squeezed when more guides are added.
 */
import { useGuideStore } from '../../stores/guides';
import { useGuideRunner } from '../../composables/useGuideRunner';
import SettingsSwitch from '../ui/SettingsSwitch.vue';
import AppTooltip from '../ui/AppTooltip.vue';
import type { Guide, GuideId } from '../../domain/guides/types';

const emit = defineEmits<{
  (e: 'close-help'): void;
}>();

const guideStore = useGuideStore();
const guideRunner = useGuideRunner();

/**
 * `isAvailable` is optional; default to "always available" so
 * guides without a pre-flight check render normally. Falsy
 * results render the row as locked (disabled button + tooltip).
 */
function isGuideAvailable(guide: Guide): boolean {
  return guide.isAvailable?.() ?? true;
}

function handleStart(id: GuideId): void {
  // Close the Help dropdown BEFORE the runner starts. driver.js
  // measures the target in the next tick; closing first means the
  // spotlight lands on the real control, not on the dropdown row
  // the user just clicked.
  emit('close-help');
  // Record the guide intent so the Journal dialog stays out of
  // the way while the guide is running or being chosen.
  guideStore.markGuideIntendedThisSession();
  // Defer one animation frame so the dropdown has actually
  // unmounted from the DOM before driver.js queries selectors.
  requestAnimationFrame(() => {
    void guideRunner.startGuide(id);
  });
}
</script>

<template>
  <div class="guides-column">
    <h3 class="guides-title">
      Guides
    </h3>
    <p class="guides-intro">
      Short interactive walkthroughs — one per surface. Click any to start;
      restart any time.
    </p>
    <ul class="guides-list">
      <li
        v-for="guide in guideStore.guides"
        :key="guide.id"
        class="guides-row"
      >
        <span
          class="guides-dot"
          :class="{
            'guides-dot--completed': guideStore.isCompleted(guide.id),
          }"
          :aria-label="
            guideStore.isCompleted(guide.id) ? 'Completed' : 'Not started'
          "
        >
          {{ guideStore.isCompleted(guide.id) ? '✓' : '○' }}
        </span>
        <div class="guides-text">
          <div class="guides-row-title">
            {{ guide.title }}
          </div>
          <div class="guides-row-desc">
            {{ guide.description }}
          </div>
        </div>
        <AppTooltip
          v-if="!isGuideAvailable(guide)"
          :text="guide.unavailableReason ?? 'Not available yet.'"
          side="top"
          align="center"
        >
          <button
            type="button"
            class="guides-start-btn guides-start-btn--locked"
            disabled
            aria-disabled="true"
            data-testid="guide-take-locked"
          >
            {{ guideStore.isCompleted(guide.id) ? 'Retake' : 'Take' }}
          </button>
        </AppTooltip>
        <button
          v-else
          type="button"
          class="guides-start-btn"
          @click="handleStart(guide.id)"
        >
          {{ guideStore.isCompleted(guide.id) ? 'Retake' : 'Take' }}
        </button>
      </li>
    </ul>
    <div class="guides-toggle-row">
      <span class="guides-toggle-label">Show guides at startup</span>
      <SettingsSwitch
        :model-value="guideStore.showAtStartup"
        aria-label="Show guides at startup"
        @update:model-value="guideStore.setShowAtStartup"
      />
    </div>
  </div>
</template>

<style scoped>
.guides-column {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  height: 100%;
}

.guides-title {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text);
}

.guides-intro {
  margin: 0;
  font-size: 0.78rem;
  color: var(--text-muted);
  line-height: 1.4;
}

.guides-list {
  list-style: none;
  margin: 0;
  padding: 0 4px 0 0;
  display: grid;
  gap: 6px;
  /* Bound to the shortcuts column height so the overall dropdown
   * doesn't grow as we add guides. max-height kept in sync with
   * the shortcuts column visually by using a vh-scoped cap; the
   * outer dropdown height ultimately limits both columns. */
  overflow-y: auto;
  min-height: 0;
  flex: 1 1 auto;
}

.guides-dot {
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  font-size: 0.8rem;
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.04);
}

.guides-dot--completed {
  color: #0d121b;
  background: var(--accent);
  font-weight: 700;
}

.guides-text {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.guides-row-title {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text);
}

.guides-row-desc {
  font-size: 0.76rem;
  color: var(--text-muted);
  line-height: 1.35;
}

.guides-start-btn {
  flex: 0 0 auto;
  padding: 5px 10px;
  border-radius: 7px;
  border: 1px solid color-mix(in srgb, var(--accent) 50%, transparent);
  background: transparent;
  color: var(--text);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}

.guides-start-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}

.guides-start-btn--locked {
  cursor: not-allowed;
  opacity: 0.55;
  border-color: color-mix(in srgb, var(--text-muted) 35%, transparent);
  color: var(--text-muted);
}

.guides-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  flex: 0 0 auto;
}

.guides-toggle-label {
  color: var(--text-muted);
  font-size: 0.82rem;
}
</style>
