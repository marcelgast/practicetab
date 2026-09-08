<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    size?: number;
  }>(),
  { size: 20 },
);
</script>

<template>
  <svg
    :width="props.size"
    :height="props.size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M7 4h10" />
    <path d="M7 20h10" />
    <path d="M8 4c0 3 2 5 4 6 2 1 4 3 4 6" />
    <path d="M16 4c0 3-2 5-4 6-2 1-4 3-4 6" />
  </svg>
</template>
