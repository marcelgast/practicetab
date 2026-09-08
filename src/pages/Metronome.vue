<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { SwitchRoot, SwitchThumb } from 'reka-ui';
import AccentSlider from '../components/ui/AccentSlider.vue';
import AppSelect from '../components/ui/AppSelect.vue';
import AppTooltip from '../components/ui/AppTooltip.vue';
import { useTapTempo } from '../composables/useTapTempo';
import { useMetronomeStore, type BeatState } from '../stores/metronome';
import { SUBDIVISION_OPTIONS } from '../services/metronomeConfigBuilder';
import {
  formatSeconds,
  selectTimeSegment,
  createIntervalInputHandlers,
} from './metronome/useMetronomeInputs';

const metronomeStore = useMetronomeStore();
const isRunning = computed(() => metronomeStore.isRunning);
const MAIN_CONTENT_CLASS = 'main-content--metronome';
const scaleFrame = ref<HTMLDivElement | null>(null);
const scaleWrapper = ref<HTMLDivElement | null>(null);
const scaleObserver = ref<ResizeObserver | null>(null);
const beatPatternRef = ref<HTMLDivElement | null>(null);
const beatScaleObserver = ref<ResizeObserver | null>(null);
const isWindows =
  typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);

const bpmInput = ref(String(metronomeStore.bpm));

watch(
  () => metronomeStore.bpm,
  (value) => {
    bpmInput.value = String(value);
  },
);

const timeSignatureOptions = [
  { label: '2 / 4', top: 2, bottom: 4 },
  { label: '3 / 8', top: 3, bottom: 8 },
  { label: '3 / 4', top: 3, bottom: 4 },
  { label: '6 / 8', top: 6, bottom: 8 },
  { label: '4 / 4', top: 4, bottom: 4 },
  { label: '9 / 8', top: 9, bottom: 8 },
  { label: '5 / 4', top: 5, bottom: 4 },
  { label: '12 / 8', top: 12, bottom: 8 },
  { label: '6 / 4', top: 6, bottom: 4 },
  { label: '5 / 8', top: 5, bottom: 8 },
  { label: '7 / 4', top: 7, bottom: 4 },
  { label: '8 / 4', top: 8, bottom: 4 },
  { label: '7 / 8', top: 7, bottom: 8 },
  { label: '9 / 4', top: 9, bottom: 4 },
  { label: '10 / 4', top: 10, bottom: 4 },
  { label: '11 / 4', top: 11, bottom: 4 },
  { label: '12 / 4', top: 12, bottom: 4 },
  { label: '13 / 4', top: 13, bottom: 4 },
] as const;

const timeSignatureSections = [
  {
    options: [
      { value: '2 / 4', label: '2 / 4' },
      { value: '3 / 8', label: '3 / 8' },
      { value: '3 / 4', label: '3 / 4' },
      { value: '6 / 8', label: '6 / 8' },
      { value: '4 / 4', label: '4 / 4' },
      { value: '9 / 8', label: '9 / 8' },
      { value: '5 / 4', label: '5 / 4' },
      { value: '12 / 8', label: '12 / 8' },
      { value: '6 / 4', label: '6 / 4' },
    ],
  },
  {
    options: [
      { value: '5 / 8', label: '5 / 8' },
      { value: '7 / 4', label: '7 / 4' },
      { value: '8 / 4', label: '8 / 4' },
      { value: '7 / 8', label: '7 / 8' },
      { value: '9 / 4', label: '9 / 4' },
      { value: '10 / 4', label: '10 / 4' },
      { value: '11 / 4', label: '11 / 4' },
      { value: '12 / 4', label: '12 / 4' },
      { value: '13 / 4', label: '13 / 4' },
    ],
  },
] as const;
const patternLocked = computed(() =>
  [16, 32].includes(metronomeStore.timeSigBottom),
);
const patternOverflow = computed(() => metronomeStore.timeSigTop > 8);
const patternDisabled = computed(
  () => patternLocked.value || patternOverflow.value,
);
const displayBeatStates = computed(() => {
  if (patternOverflow.value) {
    return metronomeStore.beatStates.slice(0, 4);
  }
  return metronomeStore.beatStates;
});
const displayBeatCount = computed(() => displayBeatStates.value.length);
const displayBeatSize = computed(() => {
  if (displayBeatCount.value >= 8) {
    return 26;
  }
  if (displayBeatCount.value === 7) {
    return 28;
  }
  return 34;
});
const displayDotSize = computed(() => {
  const size = displayBeatSize.value;
  return Math.max(8, Math.round((size / 34) * 10));
});

function updateBeatScale(): void {
  const element = beatPatternRef.value;
  if (!element) {
    return;
  }
  const clientWidth = element.clientWidth;
  const computedStyle = getComputedStyle(element);
  const paddingLeft = Number.parseFloat(computedStyle.paddingLeft);
  const paddingRight = Number.parseFloat(computedStyle.paddingRight);
  const availableWidth = clientWidth - (paddingLeft + paddingRight);
  const beatSize = Number.parseFloat(
    computedStyle.getPropertyValue('--beat-size-base'),
  );
  const beatGap = Number.parseFloat(
    computedStyle.getPropertyValue('--beat-gap-base'),
  );
  const count = displayBeatCount.value;
  if (clientWidth <= 0 || availableWidth <= 0 || beatSize <= 0 || count <= 0) {
    element.style.setProperty('--beat-scale', '1');
    return;
  }
  const requiredWidth =
    count * beatSize + Math.max(0, count - 1) * (beatGap || 0);
  if (requiredWidth <= 0) {
    element.style.setProperty('--beat-scale', '1');
    return;
  }
  const scale = Math.min(1, availableWidth / requiredWidth);
  element.style.setProperty('--beat-scale', scale.toFixed(3));
}
const controlsDisabled = computed(() => metronomeStore.isSyncActive);
const volumeDisabled = computed(() => false);

const subdivisionsSelection = computed(() =>
  metronomeStore.subdivisionsEnabled
    ? String(metronomeStore.subdivisionsValue)
    : 'off',
);
const tapTempo = useTapTempo();
const tapResetTimer = ref<number | null>(null);
const timeSignatureDisplay = computed(() => {
  if (metronomeStore.isSyncActive) {
    return `${metronomeStore.timeSigTop} / ${metronomeStore.timeSigBottom}`;
  }
  return timeSignatureSelection.value;
});

function handleBpmInput(event: Event): void {
  const target = event.target as HTMLInputElement;
  bpmInput.value = target.value.replace(/[^\d]/g, '').slice(0, 3);
}

const intervalTotalInput = ref(
  formatSeconds(metronomeStore.intervalTotalDurationSeconds),
);
const intervalInput = ref(
  formatSeconds(metronomeStore.intervalDurationSeconds),
);
const bpmIncrementInput = ref(String(metronomeStore.intervalBpmIncrement));

watch(
  () => metronomeStore.intervalTotalRemainingSeconds,
  (value) => {
    if (
      !isRunning.value ||
      !metronomeStore.intervalModeEnabled ||
      !metronomeStore.intervalTimedEnabled
    ) {
      return;
    }
    intervalTotalInput.value = formatSeconds(value ?? 0);
  },
);

watch(
  () => metronomeStore.intervalRemainingSeconds,
  (value) => {
    if (!isRunning.value || !metronomeStore.intervalModeEnabled) {
      return;
    }
    intervalInput.value = formatSeconds(value);
  },
);

watch(
  () => isRunning.value,
  (running) => {
    if (running || !metronomeStore.intervalModeEnabled) {
      return;
    }
    intervalTotalInput.value = formatSeconds(
      metronomeStore.intervalTotalDurationSeconds,
    );
    intervalInput.value = formatSeconds(metronomeStore.intervalDurationSeconds);
    bpmIncrementInput.value = String(metronomeStore.intervalBpmIncrement);
  },
);

const timeSignatureSelection = computed(() => {
  const match = timeSignatureOptions.find(
    (option) =>
      option.top === metronomeStore.timeSigTop &&
      option.bottom === metronomeStore.timeSigBottom,
  );
  return (
    match?.label ??
    `${metronomeStore.timeSigTop} / ${metronomeStore.timeSigBottom}`
  );
});

const timeSignatureSelectOptions = computed(() => {
  const base = timeSignatureOptions.map((option) => ({
    value: option.label,
    label: option.label,
  }));
  const current = timeSignatureSelection.value;
  if (base.some((option) => option.value === current)) {
    return base;
  }
  return [{ value: current, label: current }, ...base];
});

const timeSignatureSelectSections = computed(() => {
  const current = timeSignatureSelection.value;
  const inSections = timeSignatureSections.some((section) =>
    section.options.some((option) => option.value === current),
  );
  if (inSections) {
    return timeSignatureSections;
  }
  return [
    {
      options: [{ value: current, label: current }],
    },
    ...timeSignatureSections,
  ];
});
const soundModeLabel = computed(() => {
  const labels: Record<string, string> = {
    tock: 'Tock',
    blip: 'Blip',
    drumKit: 'Drum Kit',
    hype: 'Hype',
    metalKit: 'Metal Kit',
    rideKit: 'Mighty Kit',
  };
  return (
    labels[String(metronomeStore.soundMode)] ?? String(metronomeStore.soundMode)
  );
});

function handleTimeSignatureSelect(value: string | number): void {
  const selected = timeSignatureOptions.find(
    (option) => option.label === String(value),
  );
  const next =
    selected ?? timeSignatureOptions.find((option) => option.label === '4 / 4');
  if (!next) {
    return;
  }
  metronomeStore.setTimeSigTop(next.top);
  metronomeStore.setTimeSigBottom(next.bottom);
}

function handleBpmWheel(event: WheelEvent): void {
  if (controlsDisabled.value) {
    return;
  }
  event.preventDefault();
  if (event.deltaY === 0) {
    return;
  }
  const step = event.shiftKey ? 5 : 1;
  const direction = event.deltaY < 0 ? 1 : -1;
  metronomeStore.setBpm(metronomeStore.bpm + direction * step);
}

function commitBpm(): void {
  const parsed = Number(bpmInput.value);
  if (Number.isFinite(parsed)) {
    metronomeStore.setBpm(parsed);
  }
  bpmInput.value = String(metronomeStore.bpm);
}

function commitBpmFromEnter(event: KeyboardEvent): void {
  commitBpm();
  (event.target as HTMLInputElement | null)?.blur();
}

function toggleTransport(): void {
  metronomeStore.toggleRunning();
}

const {
  commitIntervalTotalInput,
  handleIntervalTotalInput,
  commitIntervalTotalInputFromEnter,
  commitIntervalInput,
  handleIntervalInput,
  commitIntervalInputFromEnter,
  handleIncrementInput,
  commitIncrementInput,
  commitIncrementInputFromEnter,
} = createIntervalInputHandlers({
  intervalTotalInput,
  intervalInput,
  bpmIncrementInput,
  metronomeStore,
});

function handleTap(): void {
  if (controlsDisabled.value) {
    return;
  }
  if (tapResetTimer.value) {
    globalThis.clearTimeout(tapResetTimer.value);
    tapResetTimer.value = null;
  }
  const bpm = tapTempo.tap();
  const delayMs =
    tapTempo.tapCount.value >= tapTempo.requiredTaps.value ? 1000 : 5000;
  tapResetTimer.value = globalThis.setTimeout(() => {
    tapTempo.reset();
    tapResetTimer.value = null;
  }, delayMs);
  if (bpm !== null) {
    metronomeStore.setBpm(bpm);
  }
}

function handleSubdivisionsChange(value: string | number): void {
  const next = String(value);
  if (next === 'off') {
    metronomeStore.setSubdivisions(false);
    return;
  }
  metronomeStore.setSubdivisions(
    true,
    Number(next) as 1 | 2 | 3 | 4 | 5 | 6 | 7,
  );
}

function beatStateLabel(state: BeatState): string {
  switch (state) {
    case 'accent':
      return 'Accent';
    case 'normal':
      return 'Normal';
    case 'low':
      return 'Lower Accent';
    case 'mute':
      return 'Mute';
    default:
      return 'Normal';
  }
}

function handleBeatToggle(index: number): void {
  if (controlsDisabled.value || patternDisabled.value) {
    return;
  }
  metronomeStore.cycleBeat(index);
}

onMounted(() => {
  document.querySelector('.main-content')?.classList.add(MAIN_CONTENT_CLASS);
  if (!scaleFrame.value || !scaleWrapper.value) {
    return;
  }
  const maxScale = isWindows ? 1.2 : 1.5;
  let lastScale = 1;
  const updateScale = (width: number) => {
    const nextScale = Math.min(maxScale, Math.max(1, width / 466));
    if (Math.abs(nextScale - lastScale) < 0.01) {
      return;
    }
    lastScale = nextScale;
    scaleWrapper.value?.style.setProperty(
      '--metronome-scale',
      String(nextScale),
    );
  };
  const observer = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry) {
      return;
    }
    updateScale(entry.contentRect.width);
  });
  observer.observe(scaleFrame.value);
  updateScale(scaleFrame.value.getBoundingClientRect().width);
  scaleObserver.value = observer;

  if (beatPatternRef.value) {
    const beatObserver = new ResizeObserver(() => {
      updateBeatScale();
    });
    beatObserver.observe(beatPatternRef.value);
    beatScaleObserver.value = beatObserver;
    updateBeatScale();
  }
});

onUnmounted(() => {
  document.querySelector('.main-content')?.classList.remove(MAIN_CONTENT_CLASS);
  if (scaleObserver.value && scaleFrame.value) {
    scaleObserver.value.unobserve(scaleFrame.value);
  }
  scaleObserver.value = null;
  if (beatScaleObserver.value && beatPatternRef.value) {
    beatScaleObserver.value.unobserve(beatPatternRef.value);
  }
  beatScaleObserver.value = null;
});

watch(displayBeatStates, async () => {
  await nextTick();
  updateBeatScale();
});
</script>

<template>
  <section class="page metronome-page">
    <div
      ref="scaleFrame"
      class="metronome-scale-frame"
    >
      <div
        ref="scaleWrapper"
        class="metronome-scale"
      >
        <div class="metronome-shell">
          <div class="metronome-header">
            <h1 class="page-title">
              Metronome
            </h1>
          </div>

          <div class="metronome-controls">
            <div class="control-block full-width">
              <div
                class="volume-control"
                data-guide="metronome.volume"
              >
                <span class="label">Vol.:</span>
                <AccentSlider
                  :model-value="metronomeStore.volume"
                  :min="0"
                  :max="100"
                  :step="1"
                  :disabled="volumeDisabled"
                  @update:model-value="metronomeStore.setVolume"
                />
                <span class="volume-value">{{ metronomeStore.volume }}%</span>
              </div>
            </div>
            <div class="control-block">
              <div
                class="interval-box"
                data-guide="metronome.interval-mode"
              >
                <label class="interval-header-row">
                  <span
                    class="label"
                    title="Interval Mode"
                  >Interval Mode</span>
                  <SwitchRoot
                    :model-value="metronomeStore.intervalModeEnabled"
                    class="interval-switch"
                    title="Interval Mode"
                    @update:model-value="
                      metronomeStore.setIntervalModeEnabled(Boolean($event))
                    "
                  >
                    <SwitchThumb class="interval-switch__thumb" />
                  </SwitchRoot>
                </label>
                <template v-if="metronomeStore.intervalModeEnabled">
                  <div class="interval-divider" />
                  <div class="interval-grid">
                    <label class="interval-cell">
                      <span class="interval-row">
                        <span
                          class="label"
                          title="Timed"
                        >Timed</span>
                        <SwitchRoot
                          :model-value="metronomeStore.intervalTimedEnabled"
                          class="interval-switch"
                          title="Timed"
                          @update:model-value="
                            metronomeStore.setIntervalTimedEnabled(
                              Boolean($event),
                            )
                          "
                        >
                          <SwitchThumb class="interval-switch__thumb" />
                        </SwitchRoot>
                      </span>
                      <AppTooltip text="Total Duration">
                        <span class="tooltip-input-wrap">
                          <input
                            v-model="intervalTotalInput"
                            type="text"
                            class="interval-time-input"
                            :disabled="
                              !metronomeStore.intervalTimedEnabled ||
                                (isRunning && metronomeStore.intervalModeEnabled)
                            "
                            @click="
                              selectTimeSegment(
                                $event.target as HTMLInputElement,
                              )
                            "
                            @focus="
                              selectTimeSegment(
                                $event.target as HTMLInputElement,
                              )
                            "
                            @input="handleIntervalTotalInput"
                            @keydown.enter.prevent.stop="
                              commitIntervalTotalInputFromEnter
                            "
                            @blur="commitIntervalTotalInput"
                            @change="commitIntervalTotalInput"
                          >
                        </span>
                      </AppTooltip>
                    </label>
                    <label class="interval-cell">
                      <span class="interval-row">
                        <span
                          class="label"
                          title="Interval"
                        >Interval</span>
                        <span
                          class="interval-switch-spacer"
                          aria-hidden="true"
                        />
                      </span>
                      <AppTooltip text="Interval Duration">
                        <span class="tooltip-input-wrap">
                          <input
                            v-model="intervalInput"
                            type="text"
                            class="interval-time-input"
                            :disabled="
                              isRunning && metronomeStore.intervalModeEnabled
                            "
                            @click="
                              selectTimeSegment(
                                $event.target as HTMLInputElement,
                              )
                            "
                            @focus="
                              selectTimeSegment(
                                $event.target as HTMLInputElement,
                              )
                            "
                            @input="handleIntervalInput"
                            @keydown.enter.prevent.stop="
                              commitIntervalInputFromEnter
                            "
                            @blur="commitIntervalInput"
                            @change="commitIntervalInput"
                          >
                        </span>
                      </AppTooltip>
                    </label>
                    <label class="interval-cell">
                      <span class="interval-row">
                        <span
                          class="label"
                          title="BPM Step"
                        >BPM Step</span>
                        <SwitchRoot
                          :model-value="
                            metronomeStore.intervalBpmIncrementEnabled
                          "
                          class="interval-switch"
                          title="BPM Step"
                          @update:model-value="
                            metronomeStore.setIntervalBpmIncrementEnabled(
                              Boolean($event),
                            )
                          "
                        >
                          <SwitchThumb class="interval-switch__thumb" />
                        </SwitchRoot>
                      </span>
                      <AppTooltip text="BPM Step">
                        <span class="tooltip-input-wrap">
                          <input
                            :value="bpmIncrementInput"
                            type="text"
                            inputmode="numeric"
                            class="interval-time-input interval-time-input--bpm"
                            placeholder="0"
                            :disabled="
                              !metronomeStore.intervalBpmIncrementEnabled ||
                                (isRunning && metronomeStore.intervalModeEnabled)
                            "
                            @input="handleIncrementInput"
                            @keydown.enter.prevent.stop="
                              commitIncrementInputFromEnter
                            "
                            @blur="commitIncrementInput"
                            @change="commitIncrementInput"
                          >
                        </span>
                      </AppTooltip>
                    </label>
                  </div>
                  <label class="interval-timer-only-row">
                    <AppTooltip text="Mute metronome clicks, keep timer beeps">
                      <span
                        class="interval-timer-only-toggle"
                        title="Timer Only"
                      >
                        <span class="label">Timer Only</span>
                        <SwitchRoot
                          :model-value="metronomeStore.intervalTimerOnlyEnabled"
                          class="interval-switch"
                          title="Timer Only"
                          @update:model-value="
                            metronomeStore.setIntervalTimerOnlyEnabled(
                              Boolean($event),
                            )
                          "
                        >
                          <SwitchThumb class="interval-switch__thumb" />
                        </SwitchRoot>
                      </span>
                    </AppTooltip>
                  </label>
                </template>
              </div>
            </div>
            <div class="control-block">
              <div class="time-row">
                <div class="time-group">
                  <span class="label">Time Signature</span>
                  <div
                    class="time-signature accent-outline"
                    data-guide="metronome.time-signature"
                  >
                    <AppSelect
                      data-testid="timesig-top"
                      aria-label="Time signature"
                      trigger-class="time-input time-input--signature"
                      content-class="time-signature-content"
                      :display-value="timeSignatureDisplay"
                      :sections="timeSignatureSelectSections"
                      :lock-content-width="true"
                      :side-offset="17"
                      :options="timeSignatureSelectOptions"
                      :model-value="timeSignatureSelection"
                      :disabled="controlsDisabled"
                      @update:model-value="handleTimeSignatureSelect"
                    />
                  </div>
                </div>
                <div class="subdivision-group">
                  <label
                    class="label"
                    for="subdivision-select"
                  >
                    Subdivisions
                  </label>
                  <AppSelect
                    trigger-id="subdivision-select"
                    trigger-class="accent-outline select-input subdivision-select"
                    data-testid="subdivision-select"
                    data-guide="metronome.subdivision"
                    aria-label="Subdivisions"
                    :options="SUBDIVISION_OPTIONS"
                    :model-value="subdivisionsSelection"
                    :disabled="controlsDisabled"
                    @update:model-value="handleSubdivisionsChange"
                  />
                </div>
              </div>
            </div>

            <div class="control-block">
              <div class="bpm-row">
                <div class="bpm-inline">
                  <div
                    class="tap-dots"
                    aria-hidden="true"
                  >
                    <span
                      v-for="index in 4"
                      :key="`tap-dot-${index}`"
                      class="tap-dot"
                      :class="{
                        'is-active': tapTempo.tapCount.value >= 5 - index,
                      }"
                    />
                  </div>
                  <button
                    type="button"
                    class="tap-button"
                    data-guide="metronome.tap-tempo"
                    :disabled="controlsDisabled"
                    @click="handleTap"
                  >
                    Tap
                    <span
                      v-if="
                        tapTempo.tapCount.value > 0 &&
                          tapTempo.tapCount.value < tapTempo.requiredTaps.value
                      "
                      class="tap-progress"
                    >
                      ({{ tapTempo.tapCount.value }}/{{
                        tapTempo.requiredTaps.value
                      }})
                    </span>
                  </button>
                  <div class="bpm-field">
                    <span class="label bpm-label">BPM</span>
                    <AppTooltip
                      text="BPM"
                      side="bottom"
                      align="center"
                    >
                      <span class="tooltip-input-wrap tooltip-input-wrap--bpm">
                        <input
                          type="text"
                          inputmode="numeric"
                          class="bpm-input"
                          data-guide="metronome.tempo"
                          :value="bpmInput"
                          :disabled="controlsDisabled"
                          @wheel="handleBpmWheel"
                          @input="handleBpmInput"
                          @keydown.enter.prevent.stop="commitBpmFromEnter"
                          @blur="commitBpm"
                          @change="commitBpm"
                        >
                      </span>
                    </AppTooltip>
                    <span class="bpm-wheel-hint">Scroll to adjust</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="control-block">
              <span
                class="label beat-pattern-label"
                style="margin-top: 0"
              >Beat Pattern</span>
              <div
                ref="beatPatternRef"
                class="beat-pattern"
                :style="{
                  '--beat-count': displayBeatCount,
                  '--beat-size-base': `${displayBeatSize}px`,
                  '--beat-dot-size': `${displayDotSize}px`,
                }"
              >
                <div
                  class="beat-pattern-row"
                  data-guide="metronome.accents"
                >
                  <button
                    v-for="(state, index) in displayBeatStates"
                    :key="`beat-${index}`"
                    type="button"
                    class="beat-toggle"
                    :class="{
                      'is-disabled': controlsDisabled || patternDisabled,
                    }"
                    :data-state="state"
                    :aria-label="`Beat ${index + 1}: ${beatStateLabel(state)}`"
                    :disabled="controlsDisabled || patternDisabled"
                    @click="handleBeatToggle(index)"
                  >
                    <span class="beat-dot beat-dot--top" />
                    <span class="beat-dot beat-dot--bottom" />
                  </button>
                </div>
              </div>
              <p
                v-if="patternLocked"
                class="pattern-hint"
              >
                Pattern editing disabled for 16/32
              </p>
            </div>

            <div class="control-block">
              <div class="sound-row">
                <AppSelect
                  trigger-id="sound-select"
                  trigger-class="accent-outline select-input sound-select"
                  aria-label="Sound"
                  data-guide="metronome.sound-mode"
                  :options="[
                    { value: 'tock', label: 'Tock' },
                    { value: 'blip', label: 'Blip' },
                    { value: 'drumKit', label: 'Drum Kit' },
                    { value: 'hype', label: 'Hype' },
                    { value: 'metalKit', label: 'Metal Kit' },
                    { value: 'rideKit', label: 'Mighty Kit' },
                  ]"
                  :model-value="metronomeStore.soundMode"
                  :display-value="`Sound: ${soundModeLabel}`"
                  :disabled="controlsDisabled"
                  @update:model-value="
                    metronomeStore.setSoundMode(
                      $event as
                        | 'tock'
                        | 'blip'
                        | 'drumKit'
                        | 'hype'
                        | 'metalKit'
                        | 'rideKit',
                    )
                  "
                />
                <button
                  type="button"
                  class="sync-indicator"
                  :class="{ 'is-synced': metronomeStore.isSyncActive }"
                >
                  Synced
                </button>
              </div>
            </div>
          </div>

          <div class="transport-row">
            <button
              type="button"
              class="transport-button"
              data-guide="metronome.play-stop"
              :aria-pressed="isRunning"
              :class="{ 'is-running': isRunning }"
              :disabled="controlsDisabled"
              @click="toggleTransport"
            >
              <span
                v-if="!isRunning"
                class="play-icon"
                :class="{ 'is-windows': isWindows }"
              >▶</span>
              <span
                v-else
                class="pause-icon"
              >
                <span class="pause-bar" />
                <span class="pause-bar" />
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.metronome-page {
  display: flex;
  justify-content: center;
}

:global(.main-content.main-content--metronome) {
  padding: 28px clamp(20px, 4vw, 40px) 0;
  scrollbar-gutter: stable;
}

.metronome-scale-frame {
  width: 100%;
  display: flex;
  justify-content: center;
}

.metronome-scale {
  width: 466px;
  --metronome-scale: 1;
  transform: scale(var(--metronome-scale));
  transform-origin: top center;
}

.metronome-shell {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 32px;
  padding: 12px 4px 40px;
}

.metronome-header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.page-title {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
}

.page-title {
  margin: 0;
  text-align: center;
}

.label {
  font-size: 13px;
  text-transform: none;
  letter-spacing: 0.08em;
  color: rgba(230, 230, 234, 0.7);
}

.control-block .label {
  text-align: center;
}

.volume-control {
  display: flex;
  align-items: center;
  gap: 12px;
  width: min(75%, 100%);
}

.volume-control :deep(.accent-slider) {
  flex: 1;
}

.volume-value {
  min-width: 44px;
  text-align: right;
  font-size: 13px;
  color: rgba(230, 230, 234, 0.7);
}

.metronome-controls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 24px;
}

.control-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.control-block.full-width {
  grid-column: 1 / -1;
  align-items: center;
}

.metronome-controls select:disabled,
.metronome-controls input:disabled,
.metronome-controls button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.beat-pattern-label {
  margin-bottom: 10px;
}

.accent-outline {
  border: 1px solid var(--accent);
  border-radius: 10px;
  background: transparent;
  color: inherit;
}

.time-signature {
  display: inline-flex;
  align-items: center;
  gap: 0;
  padding: 0;
  height: 42px;
  width: 112px;
}

.time-row {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 24px;
  justify-content: center;
}

.time-group,
.subdivision-group {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.bpm-row {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.bpm-inline {
  display: inline-flex;
  align-items: center;
  gap: 24px;
}

.bpm-field {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  transform: translateY(12px);
}

.tooltip-input-wrap {
  display: block;
  width: 100%;
}

.tooltip-input-wrap--bpm {
  width: 160px;
  margin: 0 auto;
}

.bpm-input {
  width: 160px;
  height: 56px;
  border: 1px solid var(--accent);
  border-radius: 14px;
  background: transparent;
  color: var(--accent);
  text-align: center;
  padding: 10px 12px;
  font-size: 26px;
  font-weight: 700;
  outline: none;
}

.bpm-wheel-hint {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: bold;
  color: color-mix(in srgb, var(--accent) 70%, transparent);
  opacity: 1;
  transform: none;
  pointer-events: none;
}

.bpm-label {
  text-align: center;
  font-size: 14px;
  letter-spacing: 0.12em;
  font-weight: 700;
}

.tap-button {
  width: 90px;
  height: 90px;
  border-radius: 999px;
  border: 2px solid var(--accent);
  background: transparent;
  color: inherit;
  font-size: 16px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
  transform: translateY(12px);
}

.tap-button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 20%, transparent);
}

.tap-progress {
  display: block;
  font-size: 12px;
  letter-spacing: 0.08em;
  margin-top: 4px;
}

.tap-dots {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-right: -4px;
  transform: translateY(12px);
  position: relative;
  padding-left: 14px;
}

.tap-dots::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  width: 3px;
  height: calc(4 * 8px + 3 * 12px);
  background: var(--accent);
  border-radius: 999px;
}

.tap-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: rgba(230, 230, 234, 0.25);
}

.tap-dot.is-active {
  background: var(--accent);
}

.time-input {
  width: 36px;
  border: none;
  background: transparent;
  color: inherit;
  font-size: 18px;
  text-align: center;
  outline: none;
  appearance: none;
  -webkit-appearance: none;
  background-image: none;
}

:deep(.time-input.app-select-trigger) {
  width: 36px;
  min-width: 0;
  padding: 0 4px;
  border: none;
  background: transparent;
  justify-content: center;
}

:deep(.time-input.app-select-trigger .app-select-value) {
  text-align: center;
}

.time-input--signature {
  text-align: center;
}

:deep(.time-input--signature.app-select-trigger) {
  width: 112px;
  min-width: 112px;
  padding-right: 16px;
  padding-left: 10px;
  justify-content: center;
  font-size: 18px;
  position: relative;
}

:deep(.time-input--signature.app-select-trigger .app-select-value) {
  width: 100%;
  text-align: center;
}

:deep(.time-input--signature.app-select-trigger .app-select-caret) {
  position: absolute;
  right: 12px;
}

:deep(.time-signature-content .app-select-item) {
  width: 100%;
  justify-content: center;
  text-align: center;
}

:deep(.time-signature-content.app-select-content) {
  margin-top: 0;
}

.time-divider {
  font-size: 16px;
  color: rgba(230, 230, 234, 0.7);
}

:deep(.select-input.app-select-trigger) {
  padding: 8px 12px;
  font-size: 14px;
  background: transparent;
  height: 42px;
}

:deep(.subdivision-select.app-select-trigger) {
  width: 112px;
  height: 42px;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 18px;
  text-align: center;
  appearance: none;
  -webkit-appearance: none;
  background-image: none;
}

:deep(.subdivision-select.app-select-trigger .app-select-value) {
  text-align: center;
}

.sound-row {
  display: inline-flex;
  align-items: center;
  gap: 16px;
  justify-content: center;
  width: 100%;
  --sound-control-width: 160px;
}

:deep(.sound-select.app-select-trigger) {
  width: var(--sound-control-width);
  border-radius: 10px;
  text-align: center;
  appearance: none;
  -webkit-appearance: none;
  background-image: none;
}

:deep(.sound-select.app-select-trigger .app-select-value) {
  text-align: center;
}

.sync-indicator {
  height: 42px;
  min-width: var(--sound-control-width);
  padding: 0 16px;
  border-radius: 10px;
  border: 2px solid rgba(230, 230, 234, 0.35);
  background: transparent;
  color: rgba(230, 230, 234, 0.6);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  text-align: center;
}

.sync-indicator.is-synced {
  border-color: #e24a4a;
  color: #0b0e13;
  background: #e24a4a;
  position: relative;
}

.sync-indicator.is-synced::before {
  content: '';
  position: absolute;
  inset: -6px;
  border-radius: 12px;
  border: 2px solid rgba(226, 74, 74, 0.7);
}

.interval-box {
  width: 100%;
  border: 1px solid color-mix(in srgb, var(--accent) 65%, transparent);
  border-radius: 14px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.interval-header-row,
.interval-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 24px;
}

.interval-header-row {
  justify-content: space-between;
}

.interval-row {
  justify-content: center;
}

.interval-divider {
  height: 1px;
  width: 100%;
  background: color-mix(in srgb, var(--accent) 45%, transparent);
}

.interval-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  align-items: end;
}

.interval-cell {
  display: grid;
  grid-template-rows: 24px 34px;
  gap: 6px;
  align-content: end;
  padding: 0 8px;
  position: relative;
}

.interval-timer-only-row {
  margin-top: 2px;
  padding: 0 8px;
}

.interval-timer-only-toggle {
  min-height: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.interval-switch {
  width: 44px;
  height: 24px;
  border-radius: 999px;
  border: 1px solid rgba(230, 230, 234, 0.35);
  background: rgba(230, 230, 234, 0.2);
  position: relative;
  display: inline-block;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}

.interval-switch[data-state='checked'] {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 65%, transparent);
}

.interval-switch__thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: #d6d6dc;
  transition: left 0.15s ease;
}

.interval-switch[data-state='checked'] .interval-switch__thumb {
  left: 19px;
  background: #0b0e13;
}

.interval-switch-spacer {
  width: 44px;
  height: 24px;
  flex: 0 0 auto;
}

.interval-time-input {
  width: 100%;
  height: 34px;
  border-radius: 9px;
  border: 1px solid color-mix(in srgb, var(--accent) 50%, transparent);
  background: transparent;
  color: rgba(230, 230, 234, 0.95);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-align: center;
  outline: none;
}

.interval-box .label {
  font-size: 12px;
}

.interval-time-input:disabled {
  opacity: 0.6;
}

.interval-time-input--bpm {
  width: 100%;
  justify-self: stretch;
}

.beat-pattern {
  --beat-size-base: 34px;
  --beat-gap-base: 28px;
  overflow: visible;
}

.beat-pattern-row {
  display: flex;
  flex-wrap: nowrap;
  justify-content: center;
  gap: var(--beat-gap-base);
  width: 100%;
  margin: 8px 0 18px;
  transform: scale(var(--beat-scale, 1));
  transform-origin: center;
}

.beat-toggle {
  position: relative;
  flex: 0 0 auto;
  width: var(--beat-size-base);
  height: var(--beat-size-base);
  border-radius: 999px;
  border: 4px solid color-mix(in srgb, var(--accent) 70%, transparent);
  background: transparent;
  cursor: pointer;
  padding: 0;
}

.beat-toggle.is-disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.beat-toggle[data-state='accent'],
.beat-toggle[data-state='normal'],
.beat-toggle[data-state='low'] {
  background: var(--accent);
  border-color: var(--accent);
}

.beat-toggle[data-state='mute'] {
  background: transparent;
}

.beat-dot {
  position: absolute;
  width: var(--beat-dot-size, 10px);
  height: var(--beat-dot-size, 10px);
  border-radius: 999px;
  background: var(--accent);
  left: 50%;
  transform: translateX(-50%);
  opacity: 0;
}

.beat-dot--top {
  top: -20px;
}

.beat-dot--bottom {
  bottom: -20px;
}

.beat-toggle:hover:not(:disabled) .beat-dot {
  opacity: 0.35;
}

.beat-toggle[data-state='accent'] .beat-dot--top {
  opacity: 1;
}

.beat-toggle[data-state='low'] .beat-dot--bottom {
  opacity: 1;
}

.beat-toggle:hover:not(:disabled)[data-state='accent'] .beat-dot--top,
.beat-toggle:hover:not(:disabled)[data-state='low'] .beat-dot--bottom {
  opacity: 1;
}

.pattern-hint {
  margin-top: 10px;
  font-size: 12px;
  color: rgba(230, 230, 234, 0.5);
  text-align: center;
}

.transport-row {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 72px;
  margin-top: 24px;
}

.transport-button {
  width: 144px;
  height: 144px;
  border-radius: 999px;
  border: none;
  background: var(--accent);
  color: #0b0e13;
  font-size: 80px;
  font-weight: 700;
  letter-spacing: 0.08em;
  position: relative;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.transport-button:hover {
  background: color-mix(in srgb, var(--accent) 90%, #ffffff);
}

.transport-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.transport-button.is-running {
  background: #d6d6dc;
  color: #0b0e13;
}

.transport-button.is-running::before {
  border-color: #d6d6dc;
}

.play-icon {
  font-size: 86px;
  line-height: 1;
  transform: translate(12px, 4px);
}

.play-icon.is-windows {
  transform: translate(12px, -4px);
}

.pause-icon {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  transform: translateX(0px);
}

.pause-bar {
  width: 18px;
  height: 72px;
  background: #0b0e13;
  border-radius: 6px;
}

.transport-button::before {
  content: '';
  position: absolute;
  width: 162px;
  height: 162px;
  border-radius: 999px;
  border: 2px solid color-mix(in srgb, var(--accent) 70%, transparent);
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.synced-indicator {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(230, 230, 234, 0.7);
}

@media (max-width: 720px) {
  .metronome-shell {
    padding: 12px 0 32px;
  }

  .metronome-header {
    position: static;
    flex-direction: column;
    align-items: flex-start;
  }

  .page-title {
    position: static;
    transform: none;
  }

  .transport-button {
    width: 84px;
    height: 84px;
  }

  .time-row {
    flex-wrap: wrap;
  }

  .interval-grid {
    grid-template-columns: 1fr;
  }
}
</style>
