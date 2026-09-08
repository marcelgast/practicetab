// @vitest-environment happy-dom
/* eslint-disable vue/one-component-per-file */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type App, createApp, defineComponent, nextTick } from 'vue';
import { TooltipProvider } from 'reka-ui';
import { openUrl } from '@tauri-apps/plugin-opener';
import ShortcutsHelpMenu from '../components/player/ShortcutsHelpMenu.vue';

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn().mockResolvedValue(undefined),
}));

// GuidesColumn pulls in a Pinia store; this test file doesn't
// instantiate Pinia because it's testing the dropdown shell, not
// guide content. Stub the column as a transparent marker.
vi.mock('../components/help/GuidesColumn.vue', () => ({
  default: {
    name: 'GuidesColumnStub',
    template: '<div data-testid="guides-column-stub" />',
  },
}));

describe('ShortcutsHelpMenu', () => {
  let app: App<Element> | null = null;
  let host: HTMLElement | null = null;

  beforeEach(() => {
    document.body.innerHTML = '<div class="app-overlays"></div>';
    delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown })
      .__TAURI_INTERNALS__;
  });

  afterEach(() => {
    if (app) {
      app.unmount();
      app = null;
    }
    if (host) {
      host.remove();
      host = null;
    }
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('opens dropdown and renders branding + shortcuts', async () => {
    const Component = defineComponent({
      components: { ShortcutsHelpMenu, TooltipProvider },
      template: `
        <TooltipProvider :delay-duration="0">
          <ShortcutsHelpMenu />
        </TooltipProvider>
      `,
    });

    host = document.createElement('div');
    document.body.appendChild(host);
    app = createApp(Component);
    app.mount(host);
    await nextTick();

    const button = host.querySelector('button[aria-label="Help"]');
    expect(button).toBeTruthy();

    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();

    const menu = host.querySelector('.help-dropdown');
    expect(menu).toBeTruthy();
    expect(host.querySelector('.help-logo')).toBeTruthy();
    expect(host.textContent).toContain('© MG-Studios. All rights reserved');
    expect(host.textContent).toContain('Available Keyboard Shortcuts');
    expect(host.querySelectorAll('.help-shortcut-row').length).toBeGreaterThan(
      0,
    );
  });

  it('stays closed when disabled', async () => {
    const Component = defineComponent({
      components: { ShortcutsHelpMenu, TooltipProvider },
      template: `
        <TooltipProvider :delay-duration="0">
          <ShortcutsHelpMenu :disabled="true" />
        </TooltipProvider>
      `,
    });

    host = document.createElement('div');
    document.body.appendChild(host);
    app = createApp(Component);
    app.mount(host);
    await nextTick();

    const button = host.querySelector('button[aria-label="Help"]');
    expect(button).toBeTruthy();
    expect(button?.hasAttribute('disabled')).toBe(true);

    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();

    expect(host.querySelector('.help-dropdown')).toBeNull();
  });

  it('opens via open-help event', async () => {
    const Component = defineComponent({
      components: { ShortcutsHelpMenu, TooltipProvider },
      template: `
        <TooltipProvider :delay-duration="0">
          <ShortcutsHelpMenu />
        </TooltipProvider>
      `,
    });

    host = document.createElement('div');
    document.body.appendChild(host);
    app = createApp(Component);
    app.mount(host);
    await nextTick();

    window.dispatchEvent(new CustomEvent('open-help'));
    await nextTick();

    expect(host.querySelector('.help-dropdown')).toBeTruthy();
  });

  it('closes on escape', async () => {
    const Component = defineComponent({
      components: { ShortcutsHelpMenu, TooltipProvider },
      template: `
        <TooltipProvider :delay-duration="0">
          <ShortcutsHelpMenu />
        </TooltipProvider>
      `,
    });

    host = document.createElement('div');
    document.body.appendChild(host);
    app = createApp(Component);
    app.mount(host);
    await nextTick();

    const button = host.querySelector('button[aria-label="Help"]');
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(host.querySelector('.help-dropdown')).toBeTruthy();

    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        keyCode: 27,
        bubbles: true,
      }),
    );
    await nextTick();

    expect(host.querySelector('.help-dropdown')).toBeNull();
  });

  it('uses plugin opener in tauri runtime for help centre link', async () => {
    (window as unknown as { __TAURI__?: unknown }).__TAURI__ = {};

    const Component = defineComponent({
      components: { ShortcutsHelpMenu, TooltipProvider },
      template: `
        <TooltipProvider :delay-duration="0">
          <ShortcutsHelpMenu />
        </TooltipProvider>
      `,
    });

    host = document.createElement('div');
    document.body.appendChild(host);
    app = createApp(Component);
    app.mount(host);
    await nextTick();

    const button = host.querySelector('button[aria-label="Help"]');
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();

    const linkButton = host.querySelector('.help-link') as HTMLButtonElement;
    expect(linkButton).toBeTruthy();
    linkButton.click();
    await nextTick();
    await Promise.resolve();
    await nextTick();

    expect(openUrl).toHaveBeenCalledWith('https://getPracticetab.com/help');
    expect(host.querySelector('.help-dropdown')).toBeNull();
  });

  it('falls back to window.open outside tauri runtime', async () => {
    const openSpy = vi
      .spyOn(window, 'open')
      .mockImplementation(() => null as unknown as Window);

    const Component = defineComponent({
      components: { ShortcutsHelpMenu, TooltipProvider },
      template: `
        <TooltipProvider :delay-duration="0">
          <ShortcutsHelpMenu />
        </TooltipProvider>
      `,
    });

    host = document.createElement('div');
    document.body.appendChild(host);
    app = createApp(Component);
    app.mount(host);
    await nextTick();

    const button = host.querySelector('button[aria-label="Help"]');
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();

    const linkButton = host.querySelector('.help-link') as HTMLButtonElement;
    expect(linkButton).toBeTruthy();
    linkButton.click();
    await nextTick();
    await Promise.resolve();
    await nextTick();

    expect(openSpy).toHaveBeenCalledWith(
      'https://getPracticetab.com/help',
      '_blank',
      'noopener,noreferrer',
    );
    expect(host.querySelector('.help-dropdown')).toBeNull();
  });
});
