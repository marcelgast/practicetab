// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createApp, defineComponent, nextTick, ref } from 'vue';

describe('selection overlay', () => {
  it('renders highlight blocks when selection is set', async () => {
    const Component = defineComponent({
      setup() {
        const selectionBlocks = ref([
          { left: 10, top: 20, width: 40, height: 30 },
          { left: 5, top: 60, width: 80, height: 24 },
        ]);
        return { selectionBlocks };
      },
      template: `
        <div>
          <div
            v-for="(block, index) in selectionBlocks"
            :key="index"
            class="selection-overlay"
            :style="{
              left: block.left + 'px',
              top: block.top + 'px',
              width: block.width + 'px',
              height: block.height + 'px'
            }"
          />
        </div>
      `,
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    createApp(Component).mount(host);
    await nextTick();

    const overlays = host.querySelectorAll(
      '.selection-overlay',
    ) as NodeListOf<HTMLElement>;
    expect(overlays.length).toBe(2);
    expect(overlays[0]?.style.width).toBe('40px');
    expect(overlays[0]?.style.height).toBe('30px');
  });
});
