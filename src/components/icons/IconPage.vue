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
      d="M7 3.5h6l4 4V20a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5z"
    />
    <path d="M13 3.5V8h4" />
    <path d="M8.5 12.5h7" />
    <path d="M8.5 15.5h6" />
  </svg>
</template>
