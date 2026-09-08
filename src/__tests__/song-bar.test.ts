// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createApp, defineComponent, nextTick } from 'vue';
import { createPinia } from 'pinia';
import SongBar from '../components/player/SongBar.vue';
import type { SongSection } from '../domain/songMap';

function makeSection(
  overrides: Partial<SongSection> & { timestampMs: number; label: string },
): SongSection {
  return {
    id: `sec-${overrides.label}`,
    libraryItemId: 'lib-1',
    label: overrides.label,
    color: overrides.color ?? '#5dd6a2',
    timestampMs: overrides.timestampMs,
    sortOrder: overrides.sortOrder ?? 0,
    createdAt: '2025-01-01T00:00:00Z',
  };
}

function mountSongBar(props: {
  sections: SongSection[];
  durationMs: number;
  currentMs: number;
  isPlaying: boolean;
}): { host: HTMLElement; unmount: () => void } {
  const Wrapper = defineComponent({
    components: { SongBar },
    data() {
      return { ...props };
    },
    template: `<SongBar
      :sections="sections"
      :duration-ms="durationMs"
      :current-ms="currentMs"
      :is-playing="isPlaying"
    />`,
  });
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp(Wrapper);
  app.use(createPinia());
  app.mount(host);
  return {
    host,
    unmount: () => {
      app.unmount();
      host.remove();
    },
  };
}

describe('SongBar', () => {
  it('renders current section label', async () => {
    const sections = [
      makeSection({ label: 'Intro', timestampMs: 0 }),
      makeSection({ label: 'Verse', timestampMs: 30000 }),
    ];
    const { host, unmount } = mountSongBar({
      sections,
      durationMs: 120000,
      currentMs: 15000,
      isPlaying: true,
    });
    await nextTick();

    expect(host.textContent).toContain('Intro');
    unmount();
  });

  it('shows muted dash when no current section', async () => {
    const { host, unmount } = mountSongBar({
      sections: [],
      durationMs: 120000,
      currentMs: 0,
      isPlaying: false,
    });
    await nextTick();

    const mutedLabel = host.querySelector('.song-bar__label--muted');
    expect(mutedLabel).not.toBeNull();
    unmount();
  });

  it('shows next section label with arrow', async () => {
    const sections = [
      makeSection({ label: 'Intro', timestampMs: 0 }),
      makeSection({ label: 'Verse', timestampMs: 30000 }),
      makeSection({ label: 'Chorus', timestampMs: 60000 }),
    ];
    const { host, unmount } = mountSongBar({
      sections,
      durationMs: 120000,
      currentMs: 15000,
      isPlaying: true,
    });
    await nextTick();

    expect(host.textContent).toContain('Intro');
    const arrow = host.querySelector('.song-bar__arrow');
    expect(arrow).not.toBeNull();
    expect(host.textContent).toContain('Verse');
    unmount();
  });

  it('renders section markers in timeline', async () => {
    const sections = [
      makeSection({ label: 'Intro', timestampMs: 0, color: '#ff0000' }),
      makeSection({ label: 'Verse', timestampMs: 60000, color: '#00ff00' }),
    ];
    const { host, unmount } = mountSongBar({
      sections,
      durationMs: 120000,
      currentMs: 0,
      isPlaying: false,
    });
    await nextTick();

    const markers = host.querySelectorAll('.song-bar__marker');
    expect(markers.length).toBe(2);
    unmount();
  });

  it('renders cursor element', async () => {
    const { host, unmount } = mountSongBar({
      sections: [makeSection({ label: 'Intro', timestampMs: 0 })],
      durationMs: 100000,
      currentMs: 50000,
      isPlaying: true,
    });
    await nextTick();

    const cursor = host.querySelector('.song-bar__cursor');
    expect(cursor).not.toBeNull();
    unmount();
  });
});
