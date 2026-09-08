// @vitest-environment happy-dom
/**
 * Regression for the "tab loaded → navigate to /stats → broken
 * layout" report. The PlayerPanel is hidden via `v-if` on the
 * stats route, but its underlying state (currentLibraryItemId,
 * AlphaTab render context) survives the unmount and goes stale —
 * coming back to /library or /practice tries to render against
 * that stale state. Fix: unload the tab on entry to routes that
 * don't host the player.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import { createPinia, setActivePinia } from 'pinia';

// Reactive route stub — declared at top-level so vi.mock's hoisted
// factory can reach it AND the test bodies can mutate it. Vue's
// `reactive` makes `.path` track-able by the AppLayout watcher.
const mockRoute = reactive({ path: '/practice' });

vi.mock('vue-router', () => ({
  useRoute: () => mockRoute,
  RouterLink: {
    name: 'RouterLink',
    inheritAttrs: false,
    props: ['to'],
    setup(
      _: { to: string },
      {
        slots,
        attrs,
      }: {
        slots: Record<string, () => unknown>;
        attrs: Record<string, unknown>;
      },
    ) {
      return () => h('a', attrs, slots.default?.());
    },
  },
}));

vi.mock('reka-ui', () => ({
  TooltipProvider: passthroughDiv('TooltipProvider'),
  NavigationMenuRoot: passthroughDiv('NavigationMenuRoot'),
  NavigationMenuList: passthroughDiv('NavigationMenuList'),
  NavigationMenuItem: passthroughDiv('NavigationMenuItem'),
  NavigationMenuLink: passthroughDiv('NavigationMenuLink'),
}));

vi.mock('../components/player/PlayerPanel.vue', () => ({
  default: { name: 'PlayerPanel', template: '<div />' },
}));

vi.mock('../components/player/BeatmapEditorPanel.vue', () => ({
  default: { name: 'BeatmapEditorPanel', template: '<div />' },
}));

vi.mock('../components/library/SongMapEditorPanel.vue', () => ({
  default: { name: 'SongMapEditorPanel', template: '<div />' },
}));

vi.mock('../components/ui/AppTooltip.vue', () => ({
  default: passthroughDiv('AppTooltip'),
}));

function passthroughDiv(name: string) {
  return {
    name,
    inheritAttrs: false,
    setup(
      _: unknown,
      {
        slots,
        attrs,
      }: {
        slots: Record<string, () => unknown>;
        attrs: Record<string, unknown>;
      },
    ) {
      return () => h('div', attrs, slots.default?.());
    },
  };
}

import AppLayout from '../layout/AppLayout.vue';
import { usePlayerStore } from '../stores/player';

function mountWith(pinia: ReturnType<typeof createPinia>): {
  host: HTMLElement;
  app: ReturnType<typeof createApp>;
} {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({
    render: () => h(AppLayout, null, { default: () => 'Content' }),
  });
  app.use(pinia);
  app.mount(host);
  return { host, app };
}

describe('app layout tab-unload on stats / settings entry', () => {
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    localStorage.clear();
    // ONE pinia instance per test — the test body queries stores
    // and sets up spies on it, then `mountWith(pinia)` mounts the
    // app against the SAME pinia so the watcher inside AppLayout
    // observes the same player-store instance the spies are on.
    pinia = createPinia();
    setActivePinia(pinia);
    mockRoute.path = '/practice';
  });

  it('clears the loaded tab when navigating to /stats', async () => {
    const playerStore = usePlayerStore();
    playerStore.model = {
      ...playerStore.model,
      currentLibraryItemId: 'tab-1',
    };
    const clearSpy = vi
      .spyOn(playerStore, 'clearSelection')
      .mockResolvedValue();

    const { app, host } = mountWith(pinia);
    await nextTick();

    mockRoute.path = '/stats';
    await nextTick();

    expect(clearSpy).toHaveBeenCalledTimes(1);

    app.unmount();
    host.remove();
  });

  it('clears the loaded tab when navigating to /settings', async () => {
    const playerStore = usePlayerStore();
    playerStore.model = {
      ...playerStore.model,
      currentLibraryItemId: 'tab-1',
    };
    const clearSpy = vi
      .spyOn(playerStore, 'clearSelection')
      .mockResolvedValue();

    const { app, host } = mountWith(pinia);
    await nextTick();

    mockRoute.path = '/settings';
    await nextTick();

    expect(clearSpy).toHaveBeenCalledTimes(1);

    app.unmount();
    host.remove();
  });

  it('does NOT clear when navigating to a non-tab-unload route', async () => {
    const playerStore = usePlayerStore();
    playerStore.model = {
      ...playerStore.model,
      currentLibraryItemId: 'tab-1',
    };
    const clearSpy = vi
      .spyOn(playerStore, 'clearSelection')
      .mockResolvedValue();

    const { app, host } = mountWith(pinia);
    await nextTick();

    // Library / Practice / Metronome host the PlayerPanel — the
    // tab must STAY loaded across these. Marcel only flagged Stats
    // and Settings as breaking the layout.
    mockRoute.path = '/library';
    await nextTick();
    expect(clearSpy).not.toHaveBeenCalled();

    mockRoute.path = '/metronome';
    await nextTick();
    expect(clearSpy).not.toHaveBeenCalled();

    app.unmount();
    host.remove();
  });

  it('does NOT clear when no tab is loaded (avoids spurious cleanup)', async () => {
    const playerStore = usePlayerStore();
    playerStore.model = {
      ...playerStore.model,
      currentLibraryItemId: null,
    };
    const clearSpy = vi
      .spyOn(playerStore, 'clearSelection')
      .mockResolvedValue();

    const { app, host } = mountWith(pinia);
    await nextTick();

    mockRoute.path = '/stats';
    await nextTick();

    expect(clearSpy).not.toHaveBeenCalled();

    app.unmount();
    host.remove();
  });
});
