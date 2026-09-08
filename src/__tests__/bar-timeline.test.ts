// @vitest-environment happy-dom
/* eslint-disable vue/require-prop-types, vue/order-in-components */
import { describe, expect, it } from 'vitest';
import { createApp, defineComponent } from 'vue';
import BarTimeline from '../components/shared/BarTimeline.vue';

function mountTimeline(propsData: Record<string, unknown>): {
  container: HTMLDivElement;
  app: ReturnType<typeof createApp>;
} {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const Wrapper = defineComponent({
    components: { BarTimeline },
    setup() {
      return propsData;
    },
    template: `<BarTimeline v-bind="$props" />`,
    props: ['endBar', 'markers', 'ranges', 'highlightedBar'],
  });

  const app = createApp(Wrapper, propsData);
  app.mount(container);
  return { container, app };
}

describe('BarTimeline', () => {
  it('renders tick marks for bars', () => {
    const { container, app } = mountTimeline({ endBar: 10 });
    const ticks = container.querySelectorAll('.bar-tick');
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    expect(ticks[0].textContent?.trim()).toBe('1');
    app.unmount();
  });

  it('shows marker bar numbers and pips', () => {
    const { container, app } = mountTimeline({
      endBar: 20,
      markers: [{ bar: 5 }],
    });
    const num = container.querySelector('.bar-marker-num');
    expect(num?.textContent?.trim()).toBe('5');
    const pip = container.querySelector('.bar-ruler-pip');
    expect(pip).toBeTruthy();
    app.unmount();
  });

  it('shows range start and end bar numbers', () => {
    const { container, app } = mountTimeline({
      endBar: 30,
      ranges: [{ startBar: 10, endBar: 20 }],
    });
    const nums = container.querySelectorAll('.bar-range-num');
    expect(nums.length).toBe(2);
    expect(nums[0].textContent?.trim()).toBe('10');
    expect(nums[1].textContent?.trim()).toBe('20');
    app.unmount();
  });

  it('renders without markers or ranges', () => {
    const { container, app } = mountTimeline({ endBar: 5 });
    expect(container.querySelectorAll('.bar-ruler-pip').length).toBe(0);
    expect(container.querySelectorAll('.bar-range').length).toBe(0);
    app.unmount();
  });

  it('highlights a specific bar when highlightedBar is set', () => {
    const { container, app } = mountTimeline({
      endBar: 10,
      highlightedBar: 5,
    });
    const highlighted = container.querySelector('.bar-tick--highlighted');
    expect(highlighted).toBeTruthy();
    expect(highlighted?.textContent?.trim()).toBe('5');
    app.unmount();
  });

  it('renders multiple markers and ranges together', () => {
    const { container, app } = mountTimeline({
      endBar: 50,
      markers: [{ bar: 1 }, { bar: 20 }],
      ranges: [
        { startBar: 10, endBar: 15 },
        { startBar: 30, endBar: 40 },
      ],
    });
    expect(container.querySelectorAll('.bar-ruler-pip').length).toBe(2);
    expect(container.querySelectorAll('.bar-range').length).toBe(2);
    app.unmount();
  });
});
