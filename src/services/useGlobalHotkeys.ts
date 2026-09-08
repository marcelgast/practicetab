import { onBeforeUnmount, onMounted } from 'vue';
import { usePlayerStore } from '../stores/player';
import { useUiStore } from '../stores/ui';
import { useMetronomeStore } from '../stores/metronome';
import { useSongStore } from '../stores/song';
import { usePracticeTimerStore } from '../stores/practiceTimer';
import { getPlayerHotkeyAction, shouldHandlePlayerHotkey } from './hotkeys';

export function useGlobalHotkeys(): void {
  const playerStore = usePlayerStore();
  const uiStore = useUiStore();
  const metronomeStore = useMetronomeStore();
  const songStore = useSongStore();
  const practiceTimerStore = usePracticeTimerStore();

  function handleKeydown(event: KeyboardEvent): void {
    const isSpace =
      event.code === 'Space' ||
      event.code === 'Spacebar' ||
      event.key === ' ' ||
      event.key === 'Spacebar';
    if (isSpace && shouldHandlePlayerHotkey(event.target)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      const active = document.activeElement;
      if (active instanceof HTMLElement && shouldHandlePlayerHotkey(active)) {
        active.blur();
      }
    }
    if (event.code === 'F1' && shouldHandlePlayerHotkey(event.target)) {
      window.dispatchEvent(new CustomEvent('open-help'));
      event.preventDefault();
      return;
    }
    if (event.ctrlKey && event.altKey && event.code === 'KeyV') {
      uiStore.toggleVibratoDebug();
      event.preventDefault();
      return;
    }
    const action = getPlayerHotkeyAction(event);
    if (!action) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    if (action === 'toggle') {
      const path = window.location.pathname;
      const onMetronome = path === '/metronome';
      const onPractice = path === '/practice' || path === '/';
      const metronomeSynced = metronomeStore.isSyncActive;
      if (onMetronome && !metronomeSynced) {
        metronomeStore.toggleRunning();
        return;
      }
      if (onPractice) {
        const practiceEvent = new CustomEvent('practice-space', {
          cancelable: true,
        });
        window.dispatchEvent(practiceEvent);
        event.preventDefault();
        if (practiceEvent.defaultPrevented) {
          return;
        }
      }
      // Song-only playback (no tab loaded)
      if (songStore.isLoaded && !playerStore.model.currentLibraryItemId) {
        if (songStore.isPlaying) {
          void (onPractice ? songStore.stop() : songStore.pause());
        } else {
          void songStore.play();
        }
        return;
      }
      // Unified transport: spacebar always toggles tab + song in lockstep
      const tabPlaying =
        playerStore.countInPending || playerStore.model.playback === 'playing';
      const anythingPlaying = tabPlaying || songStore.isPlaying;
      if (anythingPlaying) {
        if (onPractice || playerStore.countInPending) {
          if (tabPlaying) playerStore.stop();
          if (songStore.isLoaded) void songStore.stop();
          return;
        }
        if (tabPlaying) playerStore.pause();
        if (songStore.isLoaded) void songStore.pause();
        return;
      }
      // Nothing playing → start everything
      playerStore.togglePlayPause();
      if (songStore.isLoaded) {
        void songStore.play();
      }
      return;
    }
    if (action === 'listen') {
      playerStore.toggleListenForActiveTrack();
      return;
    }
    if (action === 'timer') {
      void practiceTimerStore.toggle();
      return;
    }
    const path = window.location.pathname;
    if (path === '/metronome' && !metronomeStore.isSyncActive) {
      void metronomeStore.setRunning(false);
      return;
    }
    window.dispatchEvent(new CustomEvent('player-stop'));
  }

  function handleKeyup(event: KeyboardEvent): void {
    const action = getPlayerHotkeyAction(event);
    if (!action) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeydown, { capture: true });
    window.addEventListener('keyup', handleKeyup, { capture: true });
  });

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleKeydown, { capture: true });
    window.removeEventListener('keyup', handleKeyup, { capture: true });
  });
}
