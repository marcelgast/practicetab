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
    <circle
      cx="12"
      cy="12"
      r="4.2"
    />
    <line
      x1="12"
      y1="2"
      x2="12"
      y2="6"
    />
    <line
      x1="12"
      y1="18"
      x2="12"
      y2="22"
    />
    <line
      x1="2"
      y1="12"
      x2="6"
      y2="12"
    />
    <line
      x1="18"
      y1="12"
      x2="22"
      y2="12"
    />
  </svg>
</template>
