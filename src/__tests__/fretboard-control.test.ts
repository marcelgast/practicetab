// @vitest-environment happy-dom
/**
 * Component tests for FretboardControl.vue (PR 4.2) — covers the
 * three disabled states (no tab / percussion track / non-fretted
 * program) and the happy-path click toggling `playerStore.fretboardOpen`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { TooltipProvider } from 'reka-ui';
import FretboardControl from '../components/player/FretboardControl.vue';
import { usePlayerStore } from '../stores/player';

vi.mock('../services/alphatabPlayer', () => ({
  alphatabPlayer: {
    setTuning: vi.fn(),
    setShowStandardNotation: vi.fn(),
    setTabRhythm: vi.fn(),
    setLayoutMode: vi.fn(),
    setLooping: vi.fn(),
    supportsTrackMute: false,
    supportsTrackSolo: false,
    supportsTrackVolume: false,
  },
  ALPHATAB_FONT_CHECK_FILE: 'Bravura.woff2',
  getAlphaTabFontDirectory: () => '/alphatab/',
}));

function mountControl(): HTMLElement {
  const Component = defineComponent({
    components: { FretboardControl, TooltipProvider },
    template: `
      <TooltipProvider :delay-duration="0">
        <FretboardControl />
      </TooltipProvider>
    `,
  });
  const host = document.createElement('div');
  document.body.appendChild(host);
  createApp(Component).mount(host);
  return host;
}

describe('FretboardControl', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('is disabled when no tab is loaded', async () => {
    const host = mountControl();
    await nextTick();
    const button = host.querySelector('button');
    expect(button?.hasAttribute('disabled')).toBe(true);
  });

  it('is disabled for percussion / tuning-less tracks', async () => {
    const store = usePlayerStore();
    store.model.currentLibraryItemId = 'lib-1';
    store.tracks = [
      { id: 'track-0', index: 0, name: 'Drums', isPercussion: true },
    ];
    store.activeTrackId = 'track-0';

    const host = mountControl();
    await nextTick();
    const button = host.querySelector('button');
    expect(button?.hasAttribute('disabled')).toBe(true);
  });

  it('is disabled for non-fretted GM programs (piano)', async () => {
    const store = usePlayerStore();
    store.model.currentLibraryItemId = 'lib-1';
    store.tracks = [
      {
        id: 'track-0',
        index: 0,
        name: 'Piano',
        tuning: [60, 64, 67],
        program: 0, // Acoustic Grand Piano, outside guitar/bass range
      },
    ];
    store.activeTrackId = 'track-0';

    const host = mountControl();
    await nextTick();
    const button = host.querySelector('button');
    expect(button?.hasAttribute('disabled')).toBe(true);
  });

  it('is enabled for guitar tracks and toggles fretboardOpen on click', async () => {
    const store = usePlayerStore();
    store.model.currentLibraryItemId = 'lib-1';
    store.tracks = [
      {
        id: 'track-0',
        index: 0,
        name: 'Guitar',
        tuning: [40, 45, 50, 55, 59, 64],
        program: 25, // GM Steel-String Guitar
      },
    ];
    store.activeTrackId = 'track-0';

    const host = mountControl();
    await nextTick();
    const button = host.querySelector('button');
    expect(button?.hasAttribute('disabled')).toBe(false);
    expect(button?.getAttribute('aria-pressed')).toBe('false');

    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(store.fretboardOpen).toBe(true);
    expect(button?.getAttribute('aria-pressed')).toBe('true');

    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(store.fretboardOpen).toBe(false);
  });
});
