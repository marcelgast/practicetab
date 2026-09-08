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
      d="M12 2.8l1.2.5 1.7-.2 1 1.6 1.6.9-.2 1.7.5 1.2-.5 1.2.2 1.7-1.6.9-1 1.6-1.7-.2-1.2.5-1.2-.5-1.7.2-1-1.6-1.6-.9.2-1.7-.5-1.2.5-1.2-.2-1.7 1.6-.9 1-1.6 1.7.2z"
    />
    <circle
      cx="12"
      cy="12"
      r="3.4"
    />
  </svg>
</template>
