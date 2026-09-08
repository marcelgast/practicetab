import { ref } from 'vue';

/**
 * Session-scope acknowledgement flag for the live-feedback beta
 * disclaimer. Lives at module scope (not Pinia, not localStorage) so
 * it resets every time the app starts — the disclaimer is important
 * enough to re-surface once per launch.
 *
 * Shared between `FeedbackToggle.vue` (reads the flag to decide whether
 * to show the modal) and `FeedbackBetaDialog.vue` (flips it to true
 * when the user clicks "I understand").
 */
export const feedbackBetaAcknowledged = ref(false);
