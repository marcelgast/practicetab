// @vitest-environment happy-dom
/* eslint-disable vue/one-component-per-file -- test harnesses define multiple throwaway host components for different prop permutations */
/**
 * SessionReviewOverlay (PR 4.3) — default values on first open,
 * hydration on re-open, goal-reached snap to 100, save payload,
 * cancel path.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, defineComponent, nextTick, ref } from 'vue';
import SessionReviewOverlay from '../components/practice/SessionReviewOverlay.vue';

type SavePayload = {
  reviewText: string;
  goalPercent: number | null;
  goalReached: boolean | null;
};

function mountOverlay(initial: {
  reviewText: string | null;
  goalPercent: number | null;
  goalReached: boolean | null;
}): {
  saveEvents: SavePayload[];
  cancelCount: { value: number };
} {
  const open = ref(true);
  const saveEvents: SavePayload[] = [];
  const cancelCount = { value: 0 };

  const Host = defineComponent({
    components: { SessionReviewOverlay },
    setup() {
      return {
        open,
        goalText: 'master the bridge',
        reviewText: initial.reviewText,
        goalPercent: initial.goalPercent,
        goalReached: initial.goalReached,
        saveEvents,
        cancelCount,
      };
    },
    template: `
      <SessionReviewOverlay
        :open="open"
        :goal-text="goalText"
        :review-text="reviewText"
        :goal-percent="goalPercent"
        :goal-reached="goalReached"
        @save="saveEvents.push($event)"
        @cancel="cancelCount.value += 1"
      />
    `,
  });

  const host = document.createElement('div');
  document.body.appendChild(host);
  createApp(Host).mount(host);

  return { saveEvents, cancelCount };
}

function getPercentLabel(): string {
  return (
    document.body.querySelector('.journal-percent-value')?.textContent ?? ''
  );
}

function getReviewTextarea(): HTMLTextAreaElement {
  return document.body.querySelector(
    '#journal-review-input',
  ) as HTMLTextAreaElement;
}

describe('SessionReviewOverlay', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('shows 0% and unchecked by default on first open', async () => {
    mountOverlay({ reviewText: null, goalPercent: null, goalReached: null });
    await nextTick();
    expect(getPercentLabel()).toBe('0 %');
    const checkbox = document.body.querySelector<HTMLInputElement>(
      '.journal-checkbox input[type="checkbox"]',
    )!;
    expect(checkbox.checked).toBe(false);
    expect(getReviewTextarea().value).toBe('');
  });

  it('hydrates from persisted values on re-open', async () => {
    mountOverlay({
      reviewText: 'productive',
      goalPercent: 85,
      goalReached: false,
    });
    await nextTick();
    expect(getPercentLabel()).toBe('85 %');
    expect(getReviewTextarea().value).toBe('productive');
  });

  it('emits save with trimmed review text and null for untouched controls', async () => {
    // Regression for review finding #8: untouched slider / checkbox
    // emit `null` (not 0 / false), so a Save with only a typed
    // review doesn't masquerade as "user explicitly set 0% / not
    // reached". Without this, `hasJournalContent` flagged every
    // first-time Save as a journal entry, polluting Stats with
    // phantom rows.
    const { saveEvents } = mountOverlay({
      reviewText: null,
      goalPercent: null,
      goalReached: null,
    });
    await nextTick();

    const textarea = getReviewTextarea();
    textarea.value = '  nailed it  ';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();

    const saveButton = Array.from(
      document.body.querySelectorAll('button'),
    ).find((btn) => btn.textContent?.trim() === 'Save review')!;
    saveButton.click();
    await nextTick();

    expect(saveEvents.length).toBe(1);
    expect(saveEvents[0]!.reviewText).toBe('nailed it');
    expect(saveEvents[0]!.goalPercent).toBeNull();
    expect(saveEvents[0]!.goalReached).toBeNull();
  });

  it('emits null/null when Save is clicked on a fresh overlay with no input', async () => {
    // Same regression as above for the truly empty case — caller
    // (BottomBarTimer) uses the all-null payload to skip the
    // setSessionReview write entirely so first-open + Save without
    // engagement doesn't create a phantom journal entry.
    const { saveEvents } = mountOverlay({
      reviewText: null,
      goalPercent: null,
      goalReached: null,
    });
    await nextTick();

    const saveButton = Array.from(
      document.body.querySelectorAll('button'),
    ).find((btn) => btn.textContent?.trim() === 'Save review')!;
    saveButton.click();
    await nextTick();

    expect(saveEvents).toHaveLength(1);
    expect(saveEvents[0]).toEqual({
      reviewText: '',
      goalPercent: null,
      goalReached: null,
    });
  });

  it('preserves persisted values on Save without further edits (re-open path)', async () => {
    // Re-opening an existing review and clicking Save without
    // touching anything must NOT null out the existing percent /
    // reached — the touched flags are seeded from the props on
    // open precisely for this case.
    const { saveEvents } = mountOverlay({
      reviewText: 'productive',
      goalPercent: 85,
      goalReached: true,
    });
    await nextTick();

    const saveButton = Array.from(
      document.body.querySelectorAll('button'),
    ).find((btn) => btn.textContent?.trim() === 'Save review')!;
    saveButton.click();
    await nextTick();

    expect(saveEvents).toHaveLength(1);
    expect(saveEvents[0]).toEqual({
      reviewText: 'productive',
      goalPercent: 85,
      goalReached: true,
    });
  });

  it('emits an explicit goalReached flag when the checkbox is ticked', async () => {
    const { saveEvents } = mountOverlay({
      reviewText: null,
      goalPercent: null,
      goalReached: null,
    });
    await nextTick();

    const checkbox = document.body.querySelector<HTMLInputElement>(
      '.journal-checkbox input[type="checkbox"]',
    )!;
    checkbox.click();
    await nextTick();
    // Wait out the snap-to-100 animation so the slider value is
    // stable when Save fires.
    await new Promise((r) => setTimeout(r, 400));
    await nextTick();

    const saveButton = Array.from(
      document.body.querySelectorAll('button'),
    ).find((btn) => btn.textContent?.trim() === 'Save review')!;
    saveButton.click();
    await nextTick();

    expect(saveEvents).toHaveLength(1);
    expect(saveEvents[0]!.goalReached).toBe(true);
    expect(saveEvents[0]!.goalPercent).toBe(100);
  });

  it('animates percent toward 100 when the Goal Reached checkbox is ticked', async () => {
    mountOverlay({ reviewText: null, goalPercent: 20, goalReached: false });
    await nextTick();
    expect(getPercentLabel()).toBe('20 %');

    const checkbox = document.body.querySelector<HTMLInputElement>(
      '.journal-checkbox input[type="checkbox"]',
    )!;
    checkbox.click();
    await nextTick();

    // Fast-forward the rAF-driven animation. happy-dom's
    // requestAnimationFrame runs on a 16 ms interval — waiting ~400
    // ms real time isn't flaky because the env uses a counter.
    await new Promise((r) => setTimeout(r, 400));
    await nextTick();
    expect(getPercentLabel()).toBe('100 %');
  });

  it('emits cancel on the Cancel button', async () => {
    const { cancelCount } = mountOverlay({
      reviewText: null,
      goalPercent: null,
      goalReached: null,
    });
    await nextTick();
    const cancelButton = Array.from(
      document.body.querySelectorAll('button'),
    ).find((btn) => btn.textContent?.trim() === 'Cancel')!;
    cancelButton.click();
    await nextTick();
    expect(cancelCount.value).toBe(1);
  });

  it('shows a placeholder when the active session had no goal', async () => {
    const open = ref(true);
    const Host = defineComponent({
      components: { SessionReviewOverlay },
      setup() {
        return { open };
      },
      template: `
        <SessionReviewOverlay
          :open="open"
          :goal-text="null"
          :review-text="null"
          :goal-percent="null"
          :goal-reached="null"
        />
      `,
    });
    const host = document.createElement('div');
    document.body.appendChild(host);
    createApp(Host).mount(host);
    await nextTick();
    const goalText =
      document.body.querySelector('.journal-goal-text')?.textContent ?? '';
    expect(goalText).toContain('No goal');
  });
});
