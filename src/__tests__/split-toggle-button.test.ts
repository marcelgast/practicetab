// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createApp, defineComponent, nextTick, ref } from 'vue';
import { TooltipProvider } from 'reka-ui';
import SplitToggleButton from '../components/ui/SplitToggleButton.vue';

describe('SplitToggleButton', () => {
  it('toggles left and right segments independently', async () => {
    const Component = defineComponent({
      components: { SplitToggleButton, TooltipProvider },
      setup() {
        const left = ref(false);
        const right = ref(false);
        function toggleLeft(): void {
          left.value = !left.value;
        }
        function toggleRight(): void {
          right.value = !right.value;
        }
        return {
          left,
          right,
          toggleLeft,
          toggleRight,
        };
      },
      template: `
        <TooltipProvider :delay-duration="0">
          <SplitToggleButton
            :left-pressed="left"
            :right-pressed="right"
            left-label="Left"
            right-label="Right"
            @toggle-left="toggleLeft"
            @toggle-right="toggleRight"
          >
            <template #left>Left</template>
            <template #right>Right</template>
          </SplitToggleButton>
        </TooltipProvider>
      `,
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    createApp(Component).mount(host);
    await nextTick();

    const buttons = host.querySelectorAll('button');
    expect(buttons.length).toBe(2);

    buttons[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(buttons[0]?.getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1]?.getAttribute('aria-pressed')).toBe('false');

    buttons[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(buttons[1]?.getAttribute('aria-pressed')).toBe('true');
  });
});
