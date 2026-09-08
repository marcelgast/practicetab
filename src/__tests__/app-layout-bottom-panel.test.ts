// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import AppLayout from '../layout/AppLayout.vue';
import { useAppStore } from '../stores/app';
import { usePracticeStore } from '../stores/practice';
import { toLocalDateKey } from '../domain/stats';

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/practice' }),
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
  TooltipProvider: {
    name: 'TooltipProvider',
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
  },
  NavigationMenuRoot: {
    name: 'NavigationMenuRoot',
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
  },
  NavigationMenuList: {
    name: 'NavigationMenuList',
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
  },
  NavigationMenuItem: {
    name: 'NavigationMenuItem',
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
  },
  NavigationMenuLink: {
    name: 'NavigationMenuLink',
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
  },
}));

vi.mock('../components/player/PlayerPanel.vue', () => ({
  default: {
    name: 'PlayerPanel',
    template: '<div />',
  },
}));

vi.mock('../components/ui/AppTooltip.vue', () => ({
  default: {
    name: 'AppTooltip',
    inheritAttrs: false,
    props: {
      text: { type: String, default: '' },
      side: { type: String, default: 'bottom' },
      align: { type: String, default: 'center' },
    },
    setup(
      _: { text: string },
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
  },
}));

describe('app layout bottom panel', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('shows streak, today minutes, and weekly goal', async () => {
    const realNow = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T10:00:00Z'));
    try {
      const pinia = createPinia();
      setActivePinia(pinia);
      const appStore = useAppStore();
      appStore.weeklyStreakGoalDays = 5;

      const practiceStore = usePracticeStore();
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);
      practiceStore.sessions = [
        {
          id: 's1',
          sessionDate: toLocalDateKey(today),
          startedAt: today.toISOString(),
          endedAt: null,
          totalTimeSpentSeconds: 300,
          createdAt: today.toISOString(),
        },
        {
          id: 's2',
          sessionDate: toLocalDateKey(yesterday),
          startedAt: yesterday.toISOString(),
          endedAt: null,
          totalTimeSpentSeconds: 120,
          createdAt: yesterday.toISOString(),
        },
      ];

      const host = document.createElement('div');
      document.body.appendChild(host);
      createApp({
        render: () => h(AppLayout, null, { default: () => 'Content' }),
      })
        .use(pinia)
        .mount(host);
      await nextTick();

      expect(host.textContent).toContain('2 Days');
      expect(host.textContent).toContain('5m');
      expect(host.textContent).toContain('2 / 5 days');
    } finally {
      vi.setSystemTime(realNow);
      vi.useRealTimers();
    }
  });
});
