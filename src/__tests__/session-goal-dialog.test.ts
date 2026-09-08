// @vitest-environment happy-dom
/**
 * SessionGoalDialog (PR 4.3) — save, skip, dismiss, don't-show-again
 * checkbox, Ctrl+Enter shortcut.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, defineComponent, nextTick, ref } from 'vue';
import SessionGoalDialog from '../components/practice/SessionGoalDialog.vue';

type SaveEvent = { goalText: string; dontShowAgain: boolean };
type SkipEvent = { dontShowAgain: boolean };

function mountDialog(): {
  host: HTMLElement;
  open: ReturnType<typeof ref<boolean>>;
  saveEvents: SaveEvent[];
  skipEvents: SkipEvent[];
  dismissCount: { value: number };
} {
  const open = ref(true);
  const saveEvents: SaveEvent[] = [];
  const skipEvents: SkipEvent[] = [];
  const dismissCount = { value: 0 };

  const Host = defineComponent({
    components: { SessionGoalDialog },
    setup() {
      return { open, saveEvents, skipEvents, dismissCount };
    },
    template: `
      <SessionGoalDialog
        :open="open"
        @save="saveEvents.push($event)"
        @skip="skipEvents.push($event)"
        @dismiss="dismissCount.value += 1"
      />
    `,
  });

  const host = document.createElement('div');
  document.body.appendChild(host);
  createApp(Host).mount(host);

  return { host, open, saveEvents, skipEvents, dismissCount };
}

function findInBody<T extends Element>(selector: string): T | null {
  return document.body.querySelector<T>(selector);
}

describe('SessionGoalDialog', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the title and disables Save until there is text', async () => {
    mountDialog();
    await nextTick();
    expect(findInBody('#journal-goal-title')).toBeTruthy();
    const saveButton = Array.from(
      document.body.querySelectorAll('button'),
    ).find((btn) => btn.textContent?.trim().startsWith('Save'));
    expect(saveButton?.hasAttribute('disabled')).toBe(true);
  });

  it('emits save with trimmed goal and dontShowAgain flag on click', async () => {
    const { saveEvents } = mountDialog();
    await nextTick();
    const textarea = findInBody<HTMLTextAreaElement>('.journal-textarea')!;
    textarea.value = '  warm up slowly  ';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();

    const checkbox = findInBody<HTMLInputElement>(
      '.journal-checkbox input[type="checkbox"]',
    )!;
    checkbox.click();
    await nextTick();

    const saveButton = Array.from(
      document.body.querySelectorAll('button'),
    ).find((btn) => btn.textContent?.trim().startsWith('Save'))!;
    saveButton.click();
    await nextTick();

    expect(saveEvents).toEqual([
      { goalText: 'warm up slowly', dontShowAgain: true },
    ]);
  });

  it('emits skip without touching the setting when unchecked', async () => {
    const { skipEvents } = mountDialog();
    await nextTick();
    const skipButton = Array.from(
      document.body.querySelectorAll('button'),
    ).find((btn) => btn.textContent?.trim() === 'Skip')!;
    skipButton.click();
    await nextTick();
    expect(skipEvents).toEqual([{ dontShowAgain: false }]);
  });

  it('emits dismiss on Escape, leaving dontShowAgain untouched', async () => {
    const { dismissCount } = mountDialog();
    await nextTick();
    const overlay = findInBody<HTMLElement>('.journal-overlay')!;
    overlay.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await nextTick();
    expect(dismissCount.value).toBe(1);
  });

  it('emits dismiss on backdrop click', async () => {
    const { dismissCount } = mountDialog();
    await nextTick();
    const overlay = findInBody<HTMLElement>('.journal-overlay')!;
    overlay.click();
    await nextTick();
    expect(dismissCount.value).toBe(1);
  });

  it('fires save exactly once on Ctrl+Enter dispatched from the textarea', async () => {
    // Regression: the textarea used to carry its own `@keydown`
    // listener that bubbled to the overlay's listener, firing
    // save twice and racing the timer toggle in the parent.
    const { saveEvents } = mountDialog();
    await nextTick();
    const textarea = findInBody<HTMLTextAreaElement>('.journal-textarea')!;
    textarea.value = 'warm up';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();

    textarea.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: true,
        bubbles: true,
      }),
    );
    await nextTick();
    expect(saveEvents).toHaveLength(1);
  });

  it('fires dismiss exactly once on Escape dispatched from the textarea', async () => {
    const { dismissCount } = mountDialog();
    await nextTick();
    const textarea = findInBody<HTMLTextAreaElement>('.journal-textarea')!;
    textarea.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await nextTick();
    expect(dismissCount.value).toBe(1);
  });
});
