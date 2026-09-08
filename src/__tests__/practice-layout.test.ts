// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { useLibraryStore } from '../stores/library';
import { usePracticeStore } from '../stores/practice';

vi.mock('reka-ui', () => {
  const passthrough = (name: string) =>
    defineComponent({
      name,
      props: { open: { type: Boolean, default: undefined } },
      setup(props, { slots }) {
        if (name === 'DialogRoot' && props.open === false) {
          return () => null;
        }
        return () => h('div', {}, slots.default?.());
      },
    });
  return {
    DialogRoot: passthrough('DialogRoot'),
    DialogPortal: passthrough('DialogPortal'),
    DialogOverlay: passthrough('DialogOverlay'),
    DialogContent: passthrough('DialogContent'),
    DialogTitle: passthrough('DialogTitle'),
    DialogDescription: passthrough('DialogDescription'),
  };
});

vi.mock('../components/ui/AppTooltip.vue', () => ({
  default: {
    name: 'AppTooltip',
    inheritAttrs: false,
    props: {
      text: { type: String, default: '' },
      side: { type: String, default: 'bottom' },
      align: { type: String, default: 'center' },
      open: { type: Boolean, default: undefined },
    },
    setup(_: never, { slots }: { slots: Record<string, () => unknown> }) {
      return () => slots.default?.();
    },
  },
}));

describe('Practice layout', () => {
  it('renders root container with practice-page class', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const pinia = createPinia();
    setActivePinia(pinia);
    const PracticePage = (await import('../pages/Practice.vue')).default;
    createApp(PracticePage).use(pinia).mount(host);

    const root = host.querySelector('.practice-page');
    expect(root).toBeTruthy();
    expect(root?.classList.contains('page')).toBe(true);
  });

  it('shows duplicate tab dialog when active', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const pinia = createPinia();
    setActivePinia(pinia);
    const libraryStore = useLibraryStore();
    libraryStore.duplicateDialogOpen = true;

    const PracticePage = (await import('../pages/Practice.vue')).default;
    createApp(PracticePage).use(pinia).mount(host);

    expect(document.body.textContent).toContain(
      'This tab has already been added to your Library',
    );
  });

  it('allows edit mode on empty plan without expanding first', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const pinia = createPinia();
    setActivePinia(pinia);
    const practiceStore = usePracticeStore();
    practiceStore.plans = [
      {
        id: 'plan-1',
        title: 'Plan',
        timed: false,
        sortOrder: 0,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      },
    ];
    practiceStore.exercises = [];

    const PracticePage = (await import('../pages/Practice.vue')).default;
    createApp(PracticePage).use(pinia).mount(host);

    const editButton = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Edit',
    );
    expect(editButton).toBeTruthy();
    expect(editButton?.getAttribute('disabled')).toBeNull();

    editButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();

    expect(host.querySelector('.add-row')).toBeTruthy();
  });
});
