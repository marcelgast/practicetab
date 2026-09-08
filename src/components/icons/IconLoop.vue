<script setup lang="ts">
const props = withDefaults(defineProps<{ size?: number }>(), {
  size: 20,
});
</script>

<template>
  <svg
    :width="props.size"
    :height="props.size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M6.5 7.5h8a4 4 0 0 1 4 4v1.2" />
    <path d="M18.5 9.5l2 2-2 2" />
    <path d="M17.5 16.5h-8a4 4 0 0 1-4-4v-1.2" />
    <path d="M5.5 14.5l-2-2 2-2" />
  </svg>
</template>
