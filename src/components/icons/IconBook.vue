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
    <path d="M4.5 5.5h6.8a2 2 0 0 1 2 2v11H6.5a2 2 0 0 0-2 2z" />
    <path d="M19.5 5.5h-6.8a2 2 0 0 0-2 2v11h6.8a2 2 0 0 1 2 2z" />
  </svg>
</template>
