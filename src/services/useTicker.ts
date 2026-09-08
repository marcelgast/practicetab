import { onScopeDispose, ref, watch, type Ref } from 'vue';

export function useTicker(
  isActive: Ref<boolean>,
  intervalMs = 1000,
): Ref<number> {
  const nowMs = ref(Date.now());
  let timer: ReturnType<typeof setInterval> | null = null;

  function stop(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function start(): void {
    stop();
    nowMs.value = Date.now();
    timer = setInterval(() => {
      nowMs.value = Date.now();
    }, intervalMs);
  }

  watch(
    isActive,
    (active) => {
      if (active) {
        start();
      } else {
        stop();
      }
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    stop();
  });

  return nowMs;
}
