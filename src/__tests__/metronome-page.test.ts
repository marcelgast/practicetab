// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { TooltipProvider } from 'reka-ui';
import MetronomePage from '../pages/Metronome.vue';
import { useAppStore } from '../stores/app';
import { useMetronomeStore } from '../stores/metronome';

const WrappedMetronome = {
  components: { MetronomePage, TooltipProvider },
  template: `
    <TooltipProvider :delay-duration="0">
      <MetronomePage />
    </TooltipProvider>
  `,
};

describe('Metronome page', () => {
  it('updates beat toggles when numerator changes', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const pinia = createPinia();
    setActivePinia(pinia);
    createApp(WrappedMetronome).use(pinia).mount(host);

    const topTrigger = host.querySelector(
      '[data-testid="timesig-top"]',
    ) as HTMLButtonElement;
    expect(topTrigger).toBeTruthy();

    const metronomeStore = useMetronomeStore();
    metronomeStore.setTimeSigTop(6);
    await nextTick();

    const beats = host.querySelectorAll('.beat-toggle');
    expect(beats.length).toBe(6);
  });

  it('cycles beat state through four options', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const pinia = createPinia();
    setActivePinia(pinia);
    createApp(WrappedMetronome).use(pinia).mount(host);

    const beat = host.querySelector('.beat-toggle') as HTMLButtonElement;
    expect(beat).toBeTruthy();
    expect(beat.getAttribute('data-state')).toBe('accent');

    beat.click();
    await nextTick();
    expect(beat.getAttribute('data-state')).toBe('normal');

    beat.click();
    await nextTick();
    expect(beat.getAttribute('data-state')).toBe('low');

    beat.click();
    await nextTick();
    expect(beat.getAttribute('data-state')).toBe('mute');

    beat.click();
    await nextTick();
    expect(beat.getAttribute('data-state')).toBe('accent');
  });

  it('disables transport button when synced and tab loaded', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const pinia = createPinia();
    setActivePinia(pinia);
    const appStore = useAppStore();
    appStore.setMetronomeEnabled(true);
    createApp(WrappedMetronome).use(pinia).mount(host);

    await nextTick();
    const button = host.querySelector('.transport-button');
    expect(button).toBeTruthy();
    expect((button as HTMLButtonElement).disabled).toBe(false);

    const metronomeStore = useMetronomeStore();
    metronomeStore.setTabLoaded(true);
    await nextTick();
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('updates bpm with mouse wheel and shows hover hint', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const pinia = createPinia();
    setActivePinia(pinia);
    createApp(WrappedMetronome).use(pinia).mount(host);

    const metronomeStore = useMetronomeStore();
    metronomeStore.setBpm(100);
    await nextTick();

    const bpmInput = host.querySelector('.bpm-input') as HTMLInputElement;
    expect(bpmInput).toBeTruthy();
    expect(host.querySelector('.bpm-wheel-hint')).toBeTruthy();

    const wheel = new WheelEvent('wheel', {
      deltaY: -120,
      bubbles: true,
      cancelable: true,
    });
    bpmInput.dispatchEvent(wheel);
    await nextTick();

    expect(metronomeStore.bpm).toBe(101);
  });

  it('removes spacing above the beat pattern label', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const pinia = createPinia();
    setActivePinia(pinia);
    createApp(WrappedMetronome).use(pinia).mount(host);

    const label = host.querySelector('.beat-pattern-label') as HTMLElement;
    expect(label).toBeTruthy();
    expect(label.style.marginTop).toBe('0px');
  });
});
