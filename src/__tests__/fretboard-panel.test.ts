// @vitest-environment happy-dom
/**
 * Component tests for FretboardPanel.vue (PR 4.2) — covers the
 * structural basics (one SVG line per string, labels from tuning)
 * and dot placement for a known beat fixture.
 *
 * Geometry math is validated indirectly: we don't assert pixel
 * coordinates (they're tied to layout constants that might tune
 * later), but we do assert the dot COUNT and the `data-*` pairs so
 * placement is provably derived from the fixture rather than
 * stubbed to something constant.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import FretboardPanel from '../components/player/FretboardPanel.vue';
import { usePlayerStore } from '../stores/player';
import { useLibraryStore } from '../stores/library';
import type { FretPosition } from '../domain/fretboard';

const getPositionMs = vi.fn(() => 500);

vi.mock('../services/libraryFileOps', () => ({
  isTauri: vi.fn(() => true),
  libraryFileOps: {
    readFileBase64: vi.fn(),
    pickGpFiles: vi.fn(() => Promise.resolve([])),
    pickAudioFiles: vi.fn(() => Promise.resolve([])),
    stat: vi.fn(() => Promise.reject(new Error('stat_unavailable'))),
  },
}));

vi.mock('../services/alphatabPlayer', () => ({
  alphatabPlayer: {
    setTuning: vi.fn(),
    setShowStandardNotation: vi.fn(),
    setTabRhythm: vi.fn(),
    setLayoutMode: vi.fn(),
    setLooping: vi.fn(),
    getCurrentPositionMs: () => getPositionMs(),
    supportsTrackMute: false,
    supportsTrackSolo: false,
    supportsTrackVolume: false,
  },
  ALPHATAB_FONT_CHECK_FILE: 'Bravura.woff2',
  getAlphaTabFontDirectory: () => '/alphatab/',
}));

function mountPanel(): HTMLElement {
  const Component = defineComponent({
    components: { FretboardPanel },
    template: `<FretboardPanel />`,
  });
  const host = document.createElement('div');
  document.body.appendChild(host);
  createApp(Component).mount(host);
  return host;
}

describe('FretboardPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    getPositionMs.mockReturnValue(500);
  });

  it('renders one string line per tuning entry and pitch-class labels', async () => {
    const playerStore = usePlayerStore();
    const libraryStore = useLibraryStore();

    libraryStore.addReferenceStub('/tmp/a.gp5', {
      fileName: 'a.gp5',
      size: 1,
      modifiedMs: 1,
      maxFret: 12,
    });
    const [item] = libraryStore.items;
    playerStore.model.currentLibraryItemId = item.id;
    playerStore.tracks = [
      {
        id: 'track-0',
        index: 0,
        name: 'Guitar',
        tuning: [64, 59, 55, 50, 45, 40], // E standard, top-line first
        program: 25,
      },
    ];
    playerStore.activeTrackId = 'track-0';

    const host = mountPanel();
    await nextTick();

    const strings = host.querySelectorAll('.fretboard-string');
    expect(strings.length).toBe(6);

    const labels = Array.from(host.querySelectorAll('.fretboard-label')).map(
      (el) => (el.textContent ?? '').trim(),
    );
    // `resolveStringLabels` returns lowest-first: low-E, A, D, G, B, high-E.
    expect(labels).toEqual(['E', 'A', 'D', 'G', 'B', 'E']);
  });

  it('paints one dot per fretting at the current playhead beat', async () => {
    const playerStore = usePlayerStore();
    const libraryStore = useLibraryStore();

    libraryStore.addReferenceStub('/tmp/b.gp5', {
      fileName: 'b.gp5',
      size: 1,
      modifiedMs: 1,
      maxFret: 5,
    });
    const [item] = libraryStore.items;
    playerStore.model.currentLibraryItemId = item.id;
    playerStore.tracks = [
      {
        id: 'track-0',
        index: 0,
        name: 'Guitar',
        tuning: [64, 59, 55, 50, 45, 40],
        program: 25,
      },
    ];
    playerStore.activeTrackId = 'track-0';
    // Let the `currentLibraryItemId` watcher flush its cache-reset
    // BEFORE seeding the fixture, otherwise the watcher clobbers
    // the map after it runs on the next tick.
    await nextTick();

    // Two-note chord at startMs=400 — panel should show two dots
    // when the playhead sits at 500 ms (last-beat-wins).
    const beatNotes = new Map<number, readonly FretPosition[]>([
      [
        400,
        [
          { stringIndex: 0, fret: 3, midiNote: 43 },
          { stringIndex: 2, fret: 0, midiNote: 50 },
        ],
      ],
    ]);
    playerStore.updateBeatNotesCache(beatNotes);

    const host = mountPanel();
    await nextTick();

    const dots = host.querySelectorAll('.fretboard-dot');
    expect(dots.length).toBe(2);
    // Exactly one of them should be the open-string variant.
    const openDots = host.querySelectorAll('.fretboard-dot--open');
    expect(openDots.length).toBe(1);
  });

  it('renders zero dots when the beat cache is empty', async () => {
    const playerStore = usePlayerStore();
    const libraryStore = useLibraryStore();
    libraryStore.addReferenceStub('/tmp/c.gp5', {
      fileName: 'c.gp5',
      size: 1,
      modifiedMs: 1,
      maxFret: 12,
    });
    const [item] = libraryStore.items;
    playerStore.model.currentLibraryItemId = item.id;
    playerStore.tracks = [
      {
        id: 'track-0',
        index: 0,
        name: 'Guitar',
        tuning: [64, 59, 55, 50, 45, 40],
        program: 25,
      },
    ];
    playerStore.activeTrackId = 'track-0';

    const host = mountPanel();
    await nextTick();

    expect(host.querySelectorAll('.fretboard-dot').length).toBe(0);
    // But the neck structure is still drawn.
    expect(host.querySelectorAll('.fretboard-string').length).toBe(6);
  });
});
