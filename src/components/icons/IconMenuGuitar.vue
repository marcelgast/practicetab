<script setup lang="ts">
import icon from '../../assets/icons/guitar_icon.svg?raw';

const props = withDefaults(defineProps<{ size?: number }>(), {
  size: 20,
});
</script>

<!-- eslint-disable vue/no-v-html -->
<template>
  <span
    class="menu-icon"
    :style="{ width: `${props.size}px`, height: `${props.size}px` }"
    v-html="icon"
  />
</template>

<style scoped>
.menu-icon :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
