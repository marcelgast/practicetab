// @vitest-environment happy-dom
/* eslint-disable vue/one-component-per-file */
import { describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createApp, defineComponent, nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

vi.mock('../components/player/PlayerPanel.vue', () => ({
  default: { template: '<div data-test="player-panel" />' },
}));

import AppLayout from '../layout/AppLayout.vue';
import { usePlayerStore } from '../stores/player';

describe('navigation menu', () => {
  it('renders five items and updates active state', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '', redirect: '/practice' },
        { path: '/practice', component: { template: '<div />' } },
        { path: '/library', component: { template: '<div />' } },
        { path: '/metronome', component: { template: '<div />' } },
        { path: '/stats', component: { template: '<div />' } },
        { path: '/settings', component: { template: '<div />' } },
      ],
    });

    const Component = defineComponent({
      components: { AppLayout },
      template: `
        <AppLayout>
          <div>Content</div>
        </AppLayout>
      `,
    });

    const host = document.createElement('div');
    document.body.appendChild(host);

    const app = createApp(Component);
    const pinia = createPinia();
    setActivePinia(pinia);
    app.use(pinia);
    app.use(router);
    await router.push('/practice');
    await router.isReady();
    app.mount(host);
    await nextTick();

    const items = host.querySelectorAll('.nav-item');
    expect(items.length).toBe(5);

    await router.push('/library');
    await nextTick();

    const active = host.querySelector('.nav-item.router-link-active');
    expect(active?.getAttribute('href')).toBe('/library');
  });

  it('prevents navigation while tab playback is running', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '', redirect: '/practice' },
        { path: '/practice', component: { template: '<div />' } },
        { path: '/library', component: { template: '<div />' } },
        { path: '/metronome', component: { template: '<div />' } },
        { path: '/stats', component: { template: '<div />' } },
        { path: '/settings', component: { template: '<div />' } },
      ],
    });

    const Component = defineComponent({
      components: { AppLayout },
      template: `
        <AppLayout>
          <div>Content</div>
        </AppLayout>
      `,
    });

    const host = document.createElement('div');
    document.body.appendChild(host);

    const app = createApp(Component);
    const pinia = createPinia();
    setActivePinia(pinia);
    app.use(pinia);
    app.use(router);
    await router.push('/practice');
    await router.isReady();
    app.mount(host);
    await nextTick();

    const playerStore = usePlayerStore();
    playerStore.model.playback = 'playing';
    await nextTick();

    const link = host.querySelector<HTMLAnchorElement>(
      '.nav-item[href="/library"]',
    );
    expect(link).not.toBeNull();
    link?.click();
    await nextTick();

    expect(router.currentRoute.value.path).toBe('/practice');
    expect(link?.getAttribute('aria-disabled')).toBe('true');
  });
});
