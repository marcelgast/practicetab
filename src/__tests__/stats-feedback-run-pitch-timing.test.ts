// @vitest-environment happy-dom
/* eslint-disable vue/one-component-per-file -- test harness defines a throwaway host component alongside the imported .vue module */
/**
 * Smoke test for the pitch-vs-timing block introduced on
 * `StatsFeedbackRunDetail`. The pure `computePitchTimingSplit`
 * aggregation is already covered by `feedback-aggregates.test.ts`;
 * this file just asserts the component renders the bars + the
 * recommendation copy wired through the correct variant class.
 */
import { describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';

import type { FeedbackRunOverview } from '../services/feedbackRunCommands';

vi.mock('../services/feedbackRunCommands', async () => {
  const actual = await vi.importActual<
    typeof import('../services/feedbackRunCommands')
  >('../services/feedbackRunCommands');
  return {
    ...actual,
    getFeedbackRunDetails: vi.fn().mockResolvedValue(null),
    deleteFeedbackRun: vi.fn().mockResolvedValue(true),
  };
});

// AppTooltip wraps reka-ui Tooltip which expects a TooltipProvider
// up-stack. We only care about the pitch/timing block in this test,
// so replace the tooltip with a transparent passthrough.
vi.mock('../components/ui/AppTooltip.vue', () => ({
  default: {
    name: 'AppTooltipStub',
    template: '<div><slot /></div>',
  },
}));

import StatsFeedbackRunDetail from '../components/stats/StatsFeedbackRunDetail.vue';

function baseRun(
  overrides: Partial<FeedbackRunOverview> = {},
): FeedbackRunOverview {
  return {
    id: 1,
    sessionId: null,
    exerciseId: null,
    libraryItemId: 'lib-1',
    endedAt: '2026-04-23T10:00:00Z',
    durationSeconds: 60,
    strictnessPreset: 'normal',
    totalNotes: 100,
    hitCount: 100,
    missedCount: 0,
    extraCount: 0,
    pitchPerfect: 0,
    pitchGood: 0,
    pitchAcceptable: 0,
    pitchWrong: 0,
    timingPerfect: 0,
    timingGood: 0,
    timingAcceptable: 0,
    timingWrong: 0,
    longestStreak: 0,
    overallScore: 0,
    suggestSlowDown: false,
    suggestStringMuting: false,
    ...overrides,
  };
}

function mount(overview: FeedbackRunOverview): HTMLElement {
  const Host = defineComponent({
    components: { StatsFeedbackRunDetail },
    props: {
      overview: {
        type: Object,
        required: true,
      },
    },
    template:
      '<StatsFeedbackRunDetail :runId="overview.id" :overview="overview" />',
  });
  const host = document.createElement('div');
  document.body.appendChild(host);
  createApp(Host, { overview }).use(createPinia()).mount(host);
  return host;
}

describe('StatsFeedbackRunDetail pitch-vs-timing block', () => {
  beforeEachSetup();

  it('renders the bars with per-axis accuracy and a pitch-focus recommendation', async () => {
    const host = mount(
      baseRun({
        totalNotes: 100,
        pitchPerfect: 20,
        pitchGood: 10, // 30 % pitch
        timingPerfect: 70,
        timingGood: 10, // 80 % timing → pitch-focus
      }),
    );
    await nextTick();
    await nextTick();

    const block = host.querySelector('.pt-split');
    expect(block).not.toBeNull();
    const text = block!.textContent ?? '';
    expect(text).toContain('Pitch');
    expect(text).toContain('Timing');
    expect(text).toContain('30 %');
    expect(text).toContain('80 %');
    expect(text.toLowerCase()).toContain('focus on pitch');
    expect(
      block!.querySelector('.pt-split-recommendation--pitch'),
    ).not.toBeNull();
  });

  it('is hidden when the run recorded zero notes', async () => {
    const host = mount(
      baseRun({
        totalNotes: 0,
        hitCount: 0,
      }),
    );
    await nextTick();
    await nextTick();
    expect(host.querySelector('.pt-split')).toBeNull();
  });
});

function beforeEachSetup(): void {
  // Happy-dom shares a single document across tests; blanking it
  // between cases keeps assertions on `.pt-split` unique.
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = '';
  });
}

// Minimal re-export of vitest's `beforeEach` so the helper above
// can call it without a separate import line above the setup
// function — keeps the helper and its hook side-by-side.
import { beforeEach } from 'vitest';
