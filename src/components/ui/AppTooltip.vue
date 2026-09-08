<script setup lang="ts">
import {
  TooltipContent,
  TooltipPortal,
  TooltipRoot,
  TooltipTrigger,
} from 'reka-ui';

type AppTooltipProps = {
  text: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  open?: boolean;
  portalTo?: string;
  zIndex?: number;
};

const props = withDefaults(defineProps<AppTooltipProps>(), {
  side: 'bottom',
  align: 'center',
  sideOffset: 8,
  open: undefined,
  portalTo: 'body',
  zIndex: 10050,
});
</script>

<template>
  <TooltipRoot
    :open="props.open"
    :delay-duration="120"
  >
    <TooltipTrigger as-child>
      <slot />
    </TooltipTrigger>
    <TooltipPortal :to="props.portalTo">
      <TooltipContent
        class="app-tooltip"
        :side="props.side"
        :align="props.align"
        :side-offset="props.sideOffset"
        :style="{ zIndex: String(props.zIndex) }"
      >
        <span class="app-tooltip__text">
          {{ props.text }}
        </span>
      </TooltipContent>
    </TooltipPortal>
  </TooltipRoot>
</template>

<style>
.app-tooltip {
  background: #12151c;
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 0.78rem;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
  z-index: 10050;
}

.app-tooltip__text {
  white-space: nowrap;
}
</style>
