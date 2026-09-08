<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';
import {
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from 'reka-ui';

type SelectOption = {
  value: string | number;
  label: string;
};

type SelectSection = {
  title?: string;
  options: ReadonlyArray<SelectOption>;
};

const props = withDefaults(
  defineProps<{
    modelValue: string | number;
    options: SelectOption[];
    sections?: ReadonlyArray<SelectSection>;
    disabled?: boolean;
    triggerClass?: string;
    contentClass?: string;
    itemClass?: string;
    viewportClass?: string;
    displayValue?: string;
    dataTestid?: string;
    ariaLabel?: string;
    triggerId?: string;
    lockContentWidth?: boolean;
    sideOffset?: number;
    side?: 'top' | 'bottom' | 'left' | 'right';
    portalled?: boolean;
    portalTo?: string | HTMLElement;
    modal?: boolean;
    disableOutsidePointerEvents?: boolean;
  }>(),
  {
    disabled: false,
    triggerClass: '',
    contentClass: '',
    itemClass: '',
    viewportClass: '',
    displayValue: undefined,
    sections: undefined,
    dataTestid: undefined,
    ariaLabel: undefined,
    triggerId: undefined,
    lockContentWidth: true,
    sideOffset: 6,
    side: 'bottom',
    portalled: true,
    portalTo: undefined,
    modal: true,
    disableOutsidePointerEvents: true,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string | number];
}>();

const triggerRef = ref<HTMLElement | { $el?: HTMLElement } | null>(null);
const contentWidth = ref<number | null>(null);
let resizeObserver: ResizeObserver | null = null;
const resolvedPortalTarget = ref<string | HTMLElement | undefined>(
  props.portalTo,
);

async function resolvePortalTarget(): Promise<void> {
  if (!props.portalTo) {
    resolvedPortalTarget.value = undefined;
    return;
  }
  if (typeof props.portalTo !== 'string') {
    resolvedPortalTarget.value = props.portalTo;
    return;
  }
  await nextTick();
  const found = document.querySelector<HTMLElement>(props.portalTo);
  resolvedPortalTarget.value = found ?? 'body';
}

const optionMap = computed(() => {
  const map = new Map<string, SelectOption>();
  props.options.forEach((option) => {
    map.set(String(option.value), option);
  });
  return map;
});

const modelKey = computed(() => {
  const key = String(props.modelValue);
  if (optionMap.value.has(key)) {
    return key;
  }
  const fallback = props.options[0];
  return fallback ? String(fallback.value) : '';
});

function handleUpdate(value: string): void {
  const next = optionMap.value.get(value)?.value ?? value;
  emit('update:modelValue', next);
}

onMounted(() => {
  void resolvePortalTarget();
  if (!props.lockContentWidth) {
    return;
  }
  const raw = triggerRef.value;
  const element =
    raw instanceof HTMLElement ? raw : (raw as { $el?: HTMLElement })?.$el;
  if (!element || typeof ResizeObserver === 'undefined') {
    return;
  }
  const update = () => {
    if (typeof element.getBoundingClientRect !== 'function') {
      return;
    }
    contentWidth.value = Math.round(element.getBoundingClientRect().width);
  };
  resizeObserver = new ResizeObserver(update);
  resizeObserver.observe(element);
  update();
});

watch(
  () => props.portalTo,
  () => {
    void resolvePortalTarget();
  },
);

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
});
</script>

<template>
  <SelectRoot
    :model-value="modelKey"
    :disabled="disabled"
    :modal="modal"
    @update:model-value="handleUpdate"
  >
    <SelectTrigger
      :id="triggerId"
      ref="triggerRef"
      class="app-select-trigger"
      :class="triggerClass"
      :data-testid="dataTestid"
      :aria-label="ariaLabel"
    >
      <SelectValue class="app-select-value">
        <template v-if="displayValue">
          {{ displayValue }}
        </template>
      </SelectValue>
      <span class="app-select-caret">▾</span>
    </SelectTrigger>
    <SelectPortal
      :disabled="!portalled"
      :to="resolvedPortalTarget"
    >
      <SelectContent
        class="app-select-content"
        :class="contentClass"
        position="popper"
        :side="side"
        :side-offset="sideOffset"
        :body-lock="false"
        :disable-outside-pointer-events="disableOutsidePointerEvents"
        :style="{
          minWidth:
            props.lockContentWidth && contentWidth
              ? `${contentWidth}px`
              : undefined,
        }"
      >
        <SelectViewport
          class="app-select-viewport"
          :class="viewportClass"
        >
          <template v-if="props.sections && props.sections.length">
            <div class="app-select-sections">
              <div
                v-for="(section, sectionIndex) in props.sections"
                :key="sectionIndex"
                class="app-select-section"
              >
                <div
                  v-if="section.title"
                  class="app-select-section-title"
                >
                  {{ section.title }}
                </div>
                <SelectItem
                  v-for="option in section.options"
                  :key="String(option.value)"
                  :value="String(option.value)"
                  class="app-select-item"
                  :class="itemClass"
                  :data-value="String(option.value)"
                >
                  <SelectItemText>{{ option.label }}</SelectItemText>
                </SelectItem>
              </div>
            </div>
          </template>
          <template v-else>
            <SelectItem
              v-for="option in options"
              :key="String(option.value)"
              :value="String(option.value)"
              class="app-select-item"
              :class="itemClass"
              :data-value="String(option.value)"
            >
              <SelectItemText>{{ option.label }}</SelectItemText>
            </SelectItem>
          </template>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>

<style scoped>
.app-select-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid var(--accent);
  background: var(--panel);
  color: var(--text);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}

.app-select-trigger:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.app-select-value {
  flex: 1;
  text-align: left;
  color: var(--text);
  opacity: 1;
  min-width: 0;
  white-space: nowrap;
  overflow-x: auto;
  overflow-y: hidden;
}

.app-select-caret {
  font-size: 12px;
  color: var(--text-muted);
}

.app-select-content {
  min-width: 160px;
  max-height: 240px;
  background: var(--panel);
  border: 1px solid var(--accent);
  border-radius: 12px;
  padding: 0;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
  overflow-y: auto;
  overflow-x: hidden;
  color: var(--text);
  z-index: 20000;
}

.app-select-viewport {
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow: visible;
  width: 100%;
}

.app-select-sections {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0;
  width: 100%;
  box-sizing: border-box;
}

.app-select-section {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-width: 0;
}

.app-select-section-title {
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.app-select-item {
  width: 100%;
  display: flex;
  align-items: center;
  padding: 6px 10px;
  font-size: 13px;
  line-height: 1.2;
  border-radius: 0;
  box-sizing: border-box;
  color: var(--text);
  background: var(--panel);
  cursor: pointer;
  outline: none;
}

.app-select-item[data-highlighted] {
  background: var(--accent);
  color: #081018;
}

.app-select-item[data-state='checked'] {
  background: var(--accent);
  color: #081018;
}
</style>
