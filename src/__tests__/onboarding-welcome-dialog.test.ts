// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, defineComponent, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';

import OnboardingWelcomeDialog from '../components/OnboardingWelcomeDialog.vue';
import { useGuideStore } from '../stores/guides';

function mount(): HTMLElement {
  const Host = defineComponent({
    components: { OnboardingWelcomeDialog },
    template: '<OnboardingWelcomeDialog />',
  });
  const host = document.createElement('div');
  document.body.appendChild(host);
  createApp(Host).use(createPinia()).mount(host);
  return host;
}

function findButton(text: string): HTMLButtonElement | null {
  return (
    Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === text,
    ) ?? null
  );
}

describe('OnboardingWelcomeDialog', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    document.body.innerHTML = '';
  });

  it('is hidden when the persisted toggle is off', async () => {
    localStorage.setItem(
      'practicetab.settings',
      JSON.stringify({
        guideState: {
          showAtStartup: false,
          completed: {},
        },
      }),
    );
    mount();
    await nextTick();
    expect(findButton('Start guide')).toBeNull();
  });

  it('renders the primary dialog on a fresh install', async () => {
    mount();
    await nextTick();
    expect(findButton('Start guide')).not.toBeNull();
    expect(findButton('No thanks')).not.toBeNull();
  });

  it('dispatches open-help with focus="guides" and dismisses welcome for the session on Start', async () => {
    mount();
    await nextTick();
    const guideStore = useGuideStore();
    let received: CustomEvent | null = null;
    const listener = (e: Event): void => {
      received = e as CustomEvent;
    };
    window.addEventListener('open-help', listener);
    findButton('Start guide')!.click();
    await nextTick();
    expect(received).not.toBeNull();
    expect((received as unknown as CustomEvent).detail).toEqual({
      focus: 'guides',
    });
    expect(guideStore.dismissedThisSession).toBe(true);
    // Session flag is set so the Journal dialog stays out of the
    // way while the user navigates the Help dropdown.
    expect(guideStore.guideIntendedThisSession).toBe(true);
    // Toggle stays on so the Welcome returns next launch.
    expect(guideStore.showAtStartup).toBe(true);
    window.removeEventListener('open-help', listener);
  });

  it('No thanks opens a confirm modal, then flips showAtStartup off', async () => {
    mount();
    await nextTick();
    const guideStore = useGuideStore();
    findButton('No thanks')!.click();
    await nextTick();
    expect(findButton('Got it, skip')).not.toBeNull();
    expect(findButton('Back')).not.toBeNull();
    findButton('Got it, skip')!.click();
    await nextTick();
    expect(guideStore.showAtStartup).toBe(false);
    expect(guideStore.dismissedThisSession).toBe(true);
    expect(findButton('Got it, skip')).toBeNull();
  });

  it('Back cancels the dismiss and returns to the primary dialog', async () => {
    mount();
    await nextTick();
    findButton('No thanks')!.click();
    await nextTick();
    findButton('Back')!.click();
    await nextTick();
    expect(findButton('Start guide')).not.toBeNull();
  });

  it('Escape on the primary screen opens the confirm step (like No thanks)', async () => {
    mount();
    await nextTick();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    expect(findButton('Got it, skip')).not.toBeNull();
  });

  it('Escape on the confirm step returns to the primary screen (like Back)', async () => {
    mount();
    await nextTick();
    findButton('No thanks')!.click();
    await nextTick();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    expect(findButton('Start guide')).not.toBeNull();
  });
});
