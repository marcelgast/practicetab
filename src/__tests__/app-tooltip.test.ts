// @vitest-environment happy-dom
/* eslint-disable vue/one-component-per-file */
import { describe, expect, it } from 'vitest';
import { createApp, defineComponent, nextTick } from 'vue';
import { TooltipProvider } from 'reka-ui';
import AppTooltip from '../components/ui/AppTooltip.vue';

describe('AppTooltip', () => {
  it('shows tooltip text on hover after delay', async () => {
    const Component = defineComponent({
      components: { AppTooltip, TooltipProvider },
      data() {
        return { open: false };
      },
      template: `
        <TooltipProvider :delay-duration="0">
          <AppTooltip text="Play" :open="open">
            <button type="button" @mouseenter="open = true">Play</button>
          </AppTooltip>
        </TooltipProvider>
      `,
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    createApp(Component).mount(host);
    await nextTick();

    const button = host.querySelector('button');
    button?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    await nextTick();

    const tooltip = document.body.querySelector('.app-tooltip');
    expect(tooltip).toBeTruthy();
    expect(tooltip?.textContent ?? '').toContain('Play');
  });

  it('applies custom z-index when provided', async () => {
    const Component = defineComponent({
      components: { AppTooltip, TooltipProvider },
      data() {
        return { open: true };
      },
      template: `
        <TooltipProvider :delay-duration="0">
          <AppTooltip text="Delete" :open="open" :z-index="10080">
            <button type="button">Delete</button>
          </AppTooltip>
        </TooltipProvider>
      `,
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    createApp(Component).mount(host);
    await nextTick();

    const tooltips = document.body.querySelectorAll('.app-tooltip');
    const tooltip = tooltips.item(tooltips.length - 1) as HTMLElement | null;
    expect(tooltip).toBeTruthy();
    expect(tooltip?.textContent ?? '').toContain('Delete');
    expect(tooltip?.style.zIndex).toBe('10080');
  });
});
