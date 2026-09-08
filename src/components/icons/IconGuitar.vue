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
    <path
      d="M16.5 5.5l2 2a2.2 2.2 0 0 1 0 3.1l-3 3a3.8 3.8 0 0 1-2.4 1.1l-2.4.2-2.8 2.8a2.6 2.6 0 0 1-3.6 0 2.6 2.6 0 0 1 0-3.6l2.8-2.8.2-2.4A3.8 3.8 0 0 1 8.5 7.5l3-3a2.2 2.2 0 0 1 3.1 0z"
    />
    <circle
      cx="7.6"
      cy="16.4"
      r="1.2"
    />
  </svg>
</template>
