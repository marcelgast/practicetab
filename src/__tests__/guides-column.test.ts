// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';

// Stub the runner — we only want to assert the column wiring.
const startGuide = vi.fn(() => true);
vi.mock('../composables/useGuideRunner', () => ({
  useGuideRunner: () => ({
    isActive: { value: false },
    activeGuideId: { value: null },
    startGuide,
    abort: vi.fn(),
  }),
}));

// AppTooltip wraps reka-ui Tooltip which expects a TooltipProvider
// up-stack. We don't need real tooltip behaviour here, just the
// slotted button. Stub to a transparent passthrough.
vi.mock('../components/ui/AppTooltip.vue', () => ({
  default: {
    name: 'AppTooltipStub',
    template: '<div><slot /></div>',
  },
}));

import GuidesColumn from '../components/help/GuidesColumn.vue';
import { useGuideStore } from '../stores/guides';
import { GUIDE_LIST } from '../domain/guides/registry';

function mount(onCloseHelp: () => void = () => {}): HTMLElement {
  const Host = defineComponent({
    components: { GuidesColumn },
    setup() {
      return { onCloseHelp };
    },
    template: '<GuidesColumn @close-help="onCloseHelp" />',
  });
  const host = document.createElement('div');
  document.body.appendChild(host);
  createApp(Host).use(createPinia()).mount(host);
  return host;
}

describe('GuidesColumn', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    document.body.innerHTML = '';
    startGuide.mockClear();
  });

  it('renders one row per registered guide', async () => {
    mount();
    await nextTick();
    const rows = document.querySelectorAll('.guides-row');
    expect(rows.length).toBe(GUIDE_LIST.length);
  });

  it('shows "Take" when not completed and "Retake" when completed', async () => {
    const host = mount();
    await nextTick();
    const guideStore = useGuideStore();
    const buttons =
      host.querySelectorAll<HTMLButtonElement>('.guides-start-btn');
    expect(buttons[0].textContent?.trim()).toBe('Take');
    guideStore.markCompleted(GUIDE_LIST[0].id);
    await nextTick();
    const refreshed =
      host.querySelectorAll<HTMLButtonElement>('.guides-start-btn');
    expect(refreshed[0].textContent?.trim()).toBe('Retake');
  });

  it('clicking Take closes the help dropdown and calls startGuide via rAF', async () => {
    let closed = false;
    const host = mount(() => {
      closed = true;
    });
    await nextTick();
    host.querySelector<HTMLButtonElement>('.guides-start-btn')!.click();
    expect(closed).toBe(true);
    // Flush rAF manually — happy-dom exposes window.requestAnimationFrame
    // as a setTimeout shim, so just wait one macrotask.
    await new Promise((r) => setTimeout(r, 0));
    expect(startGuide).toHaveBeenCalledWith(GUIDE_LIST[0].id);
  });

  it('locks rows whose guide.isAvailable() returns false', async () => {
    // Library store loads from localStorage which we cleared in
    // beforeEach, so no audio items exist — that's exactly the
    // case where the editor guides should be locked.
    const host = mount();
    await nextTick();
    const lockedButtons = host.querySelectorAll<HTMLButtonElement>(
      '[data-testid="guide-take-locked"]',
    );
    // Exactly the two editor guides expect a locked row in the
    // empty-library default state.
    expect(lockedButtons.length).toBe(2);
    lockedButtons.forEach((btn) => {
      expect(btn.disabled).toBe(true);
      expect(btn.getAttribute('aria-disabled')).toBe('true');
    });
  });

  it('a locked row does not call startGuide on click', async () => {
    const host = mount();
    await nextTick();
    const locked = host.querySelector<HTMLButtonElement>(
      '[data-testid="guide-take-locked"]',
    )!;
    locked.click();
    expect(startGuide).not.toHaveBeenCalled();
  });

  it('toggles showAtStartup via the SettingsSwitch in the toggle row', async () => {
    const host = mount();
    await nextTick();
    const guideStore = useGuideStore();
    // SettingsSwitch renders a visually-hidden checkbox; the
    // toggle row is our own wrapper scoping the query to it.
    const input = host.querySelector<HTMLInputElement>(
      '.guides-toggle-row input[type="checkbox"]',
    )!;
    expect(input.checked).toBe(guideStore.showAtStartup);
    input.checked = false;
    input.dispatchEvent(new Event('change'));
    await nextTick();
    expect(guideStore.showAtStartup).toBe(false);
  });
});
