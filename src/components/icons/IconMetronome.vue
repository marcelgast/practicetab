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
    <path d="M7 20h10l-2.2-12H9.2z" />
    <path d="M12 4v4" />
    <path d="M12 8l4-3" />
  </svg>
</template>
