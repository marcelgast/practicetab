// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import LibraryPage from '../pages/Library.vue';
import { useLibraryStore } from '../stores/library';

vi.mock('vue-router', () => ({
  useRoute: () => ({ name: 'Library' }),
}));

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

vi.mock('../services/libraryFileOps', () => ({
  isTauri: vi.fn(() => true),
  libraryFileOps: {
    pickGpFiles: vi.fn(),
    stat: vi.fn(),
  },
}));

describe('library page', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('shows Locate button for missing items', async () => {
    const fileOps = await import('../services/libraryFileOps');
    const statMock = fileOps.libraryFileOps.stat as unknown as ReturnType<
      typeof vi.fn
    >;
    statMock
      .mockResolvedValueOnce({
        fileName: 'tab.gp5',
        size: 10,
        modifiedMs: 1,
      })
      .mockRejectedValueOnce(new Error('not_found'));
    localStorage.setItem(
      'practicetab.library.v1',
      JSON.stringify([
        {
          id: 'lib-1',
          title: 'Missing Tab',
          source: { kind: 'reference', path: '/missing/tab.gp5' },
          metadata: { fileName: 'tab.gp5', size: 10, modifiedMs: 1 },
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          lastKnownOk: true,
        },
      ]),
    );

    const pinia = createPinia();
    setActivePinia(pinia);

    const host = document.createElement('div');
    document.body.appendChild(host);
    createApp(LibraryPage).use(pinia).mount(host);

    await nextTick();
    await useLibraryStore().refresh();
    await nextTick();

    const titleButton = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Missing Tab'),
    );
    titleButton?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
    const locateButton = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Locate',
    );
    expect(locateButton).toBeTruthy();
  });

  it('collapses action buttons by default so titles fill the row', async () => {
    localStorage.setItem(
      'practicetab.library.v1',
      JSON.stringify([
        {
          id: 'lib-1',
          title: 'Very Long Library Item Title That Should Truncate',
          source: { kind: 'reference', path: '/tabs/long.gp5' },
          metadata: { fileName: 'long.gp5', size: 10, modifiedMs: 1 },
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          lastKnownOk: true,
        },
      ]),
    );

    const pinia = createPinia();
    setActivePinia(pinia);

    const host = document.createElement('div');
    document.body.appendChild(host);
    createApp(LibraryPage).use(pinia).mount(host);

    await nextTick();
    await useLibraryStore().refresh();
    await nextTick();

    const actions = host.querySelector('.row-actions') as HTMLElement;
    expect(actions).toBeTruthy();
    expect(actions.style.maxWidth).toBe('0');
  });

  it('confirms before deleting a tab', async () => {
    localStorage.setItem(
      'practicetab.library.v1',
      JSON.stringify([
        {
          id: 'lib-1',
          title: 'Delete Me',
          source: { kind: 'reference', path: '/tabs/delete.gp5' },
          metadata: { fileName: 'delete.gp5', size: 10, modifiedMs: 1 },
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          lastKnownOk: true,
        },
      ]),
    );

    const pinia = createPinia();
    setActivePinia(pinia);

    const host = document.createElement('div');
    document.body.appendChild(host);
    createApp(LibraryPage).use(pinia).mount(host);

    await nextTick();
    const store = useLibraryStore();
    await store.refresh();
    const deleteSpy = vi
      .spyOn(store, 'deleteItem')
      .mockResolvedValue(undefined);
    await nextTick();

    const deleteButton = host.querySelector(
      '.confirm-trigger',
    ) as HTMLButtonElement | null;
    deleteButton?.click();
    await nextTick();

    expect(deleteSpy).not.toHaveBeenCalled();
    const yesButton = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Yes',
    );
    yesButton?.click();
    expect(deleteSpy).toHaveBeenCalledWith('lib-1');
  });

  it('does not delete when confirmation is cancelled', async () => {
    localStorage.setItem(
      'practicetab.library.v1',
      JSON.stringify([
        {
          id: 'lib-1',
          title: 'Cancel Delete',
          source: { kind: 'reference', path: '/tabs/cancel.gp5' },
          metadata: { fileName: 'cancel.gp5', size: 10, modifiedMs: 1 },
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          lastKnownOk: true,
        },
      ]),
    );

    const pinia = createPinia();
    setActivePinia(pinia);

    const host = document.createElement('div');
    document.body.appendChild(host);
    createApp(LibraryPage).use(pinia).mount(host);

    await nextTick();
    const store = useLibraryStore();
    await store.refresh();
    const deleteSpy = vi
      .spyOn(store, 'deleteItem')
      .mockResolvedValue(undefined);
    await nextTick();

    const deleteButton = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Delete',
    );
    deleteButton?.click();
    await nextTick();

    const noButton = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'No',
    );
    noButton?.click();

    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('always shows edit beatmap action in library rows', async () => {
    localStorage.setItem(
      'practicetab.library.v1',
      JSON.stringify([
        {
          id: 'lib-1',
          title: 'Beatmap Me',
          source: { kind: 'reference', path: '/tabs/beatmap.gp5' },
          metadata: { fileName: 'beatmap.gp5', size: 10, modifiedMs: 1 },
          createdAt: '2025-01-01T10:00:00Z',
          updatedAt: '2025-01-01T10:00:00Z',
          lastKnownOk: true,
        },
      ]),
    );

    const pinia = createPinia();
    setActivePinia(pinia);

    const host = document.createElement('div');
    document.body.appendChild(host);
    createApp(LibraryPage).use(pinia).mount(host);
    await nextTick();

    const editButton = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Edit beatmap',
    );
    expect(editButton).toBeTruthy();
  });
});
