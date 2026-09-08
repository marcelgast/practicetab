<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    size?: number;
  }>(),
  {
    size: 20,
  },
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
    <circle
      cx="12"
      cy="12"
      r="9"
    />
    <path
      d="M9.5 9.2a2.6 2.6 0 0 1 5 1c0 1.5-1.5 2.1-2.2 2.6-.5.4-.8.8-.8 1.5"
    />
    <circle
      cx="12"
      cy="17.2"
      r="0.6"
      fill="currentColor"
      stroke="none"
    />
  </svg>
</template>
