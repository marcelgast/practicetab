import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * Minimal toast queue for short, transient confirmations (guide
 * completed, settings saved, etc.).
 *
 * Scope is narrow on purpose: one visible toast at a time, no
 * stacking, no severity variants, no actions. If we ever need
 * destructive toasts or action buttons, extend from here rather
 * than grafting onto existing call sites.
 */
export type ToastVariant = 'success' | 'info';

export type Toast = {
  id: number;
  message: string;
  variant: ToastVariant;
  durationMs: number;
};

const DEFAULT_DURATION_MS = 3000;

export const useToastStore = defineStore('toast', () => {
  const current = ref<Toast | null>(null);
  let nextId = 1;
  let dismissTimer: ReturnType<typeof setTimeout> | null = null;

  function dismiss(): void {
    if (dismissTimer !== null) {
      clearTimeout(dismissTimer);
      dismissTimer = null;
    }
    current.value = null;
  }

  function show(
    message: string,
    options: { variant?: ToastVariant; durationMs?: number } = {},
  ): void {
    dismiss();
    const toast: Toast = {
      id: nextId++,
      message,
      variant: options.variant ?? 'success',
      durationMs: Math.max(500, options.durationMs ?? DEFAULT_DURATION_MS),
    };
    current.value = toast;
    dismissTimer = setTimeout(() => {
      // Guard: another toast may have replaced this one before the
      // timer fires. Only dismiss if the currently-shown toast is
      // still ours.
      if (current.value?.id === toast.id) {
        dismiss();
      }
    }, toast.durationMs);
  }

  return { current, show, dismiss };
});
