// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { computed, createApp, defineComponent, nextTick, ref } from 'vue';
import { selectionRectFromBeatRects } from '../domain/selection';

describe('selection drag overlay', () => {
  it('renders overlay after drag selection', async () => {
    const Component = defineComponent({
      setup() {
        const selectionStartBeatId = ref<number | null>(null);
        const selectionEndBeatId = ref<number | null>(null);
        const isSelecting = ref(false);
        const startPoint = ref<{ x: number; y: number } | null>(null);
        const beatRects = new Map<
          number,
          { left: number; top: number; width: number; height: number }
        >([
          [1, { left: 10, top: 20, width: 30, height: 10 }],
          [2, { left: 80, top: 20, width: 30, height: 10 }],
        ]);
        const selectionRect = computed(() => {
          if (
            selectionStartBeatId.value === null ||
            selectionEndBeatId.value === null
          ) {
            return null;
          }
          const startRect = beatRects.get(selectionStartBeatId.value);
          const endRect = beatRects.get(selectionEndBeatId.value);
          if (!startRect || !endRect) {
            return null;
          }
          return selectionRectFromBeatRects(startRect, endRect);
        });

        function nearestBeatId(x: number): number {
          return x < 50 ? 1 : 2;
        }

        function onPointerDown(event: PointerEvent): void {
          isSelecting.value = true;
          startPoint.value = { x: event.clientX, y: event.clientY };
          const id = nearestBeatId(event.clientX);
          selectionStartBeatId.value = id;
          selectionEndBeatId.value = id;
        }

        function onPointerMove(event: PointerEvent): void {
          if (!isSelecting.value || !startPoint.value) {
            return;
          }
          const dx = event.clientX - startPoint.value.x;
          const dy = event.clientY - startPoint.value.y;
          if (Math.hypot(dx, dy) < 4) {
            return;
          }
          selectionEndBeatId.value = nearestBeatId(event.clientX);
        }

        function onPointerUp(): void {
          isSelecting.value = false;
          startPoint.value = null;
        }

        return {
          selectionRect,
          onPointerDown,
          onPointerMove,
          onPointerUp,
        };
      },
      template: `
        <div
          class="alpha-area"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
        >
          <div
            v-if="selectionRect"
            class="selection-overlay"
            :style="{
              left: selectionRect.left + 'px',
              top: selectionRect.top + 'px',
              width: selectionRect.width + 'px',
              height: selectionRect.height + 'px'
            }"
          />
        </div>
      `,
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    createApp(Component).mount(host);
    await nextTick();

    const area = host.querySelector('.alpha-area') as HTMLElement;
    area.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 10, clientY: 10 }),
    );
    area.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 90, clientY: 10 }),
    );
    area.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 90, clientY: 10 }),
    );
    await nextTick();

    const overlay = host.querySelector(
      '.selection-overlay',
    ) as HTMLElement | null;
    expect(overlay).not.toBeNull();
    expect(overlay?.style.width).toBe('100px');
  });
});
