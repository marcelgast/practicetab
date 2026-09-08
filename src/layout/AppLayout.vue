<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import {
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuRoot,
  TooltipProvider,
} from 'reka-ui';
import { useAppStore } from '../stores/app';
import { usePracticeStore } from '../stores/practice';
import { useBeatmapStore } from '../stores/beatmap';
import { useSongMapStore } from '../stores/songMap';
import { usePlayerStore } from '../stores/player';
import { useSongStore } from '../stores/song';
import PlayerPanel from '../components/player/PlayerPanel.vue';
import BeatmapEditorPanel from '../components/player/BeatmapEditorPanel.vue';
import SongMapEditorPanel from '../components/library/SongMapEditorPanel.vue';
import { useUiStore } from '../stores/ui';
import { BookOpen, FileText, Flame, Settings } from 'lucide-vue-next';
import { formatStreakDays } from '../domain/stats/formatters';
import IconMenuGuitar from '../components/icons/IconMenuGuitar.vue';
import IconMenuMetronome from '../components/icons/IconMenuMetronome.vue';
import AppTooltip from '../components/ui/AppTooltip.vue';
import {
  computeCurrentStreak,
  computeCurrentWeekStreak,
  computeLongestStreak,
  getSessionLocalDate,
  normalizeDisplayMinutes,
  toLocalDateKey,
} from '../domain/stats';

const appStore = useAppStore();
const uiStore = useUiStore();
const practiceStore = usePracticeStore();
const beatmapStore = useBeatmapStore();
const songMapStore = useSongMapStore();
const playerStore = usePlayerStore();
const songStore = useSongStore();
const showBeatmapPanel = computed(() => beatmapStore.editorItemId !== null);
const showSongMapPanel = computed(() => songMapStore.editorItemId !== null);
const showOverlayPanel = computed(
  () => showBeatmapPanel.value || showSongMapPanel.value,
);
const route = useRoute();
const accentStyle = computed(() => ({ '--accent': appStore.accentColor }));
// Nav is locked only while actual tab/audio playback is in flight —
// exercise expansion alone (which starts the exercise timer) must not
// prevent the user from browsing other pages. Count-in pending is
// treated as playback since it's part of the same uninterruptible flow.
const isTimerLocked = computed(
  () =>
    playerStore.model.playback === 'playing' ||
    playerStore.countInPending ||
    songStore.isPlaying,
);
const nowTick = ref(Date.now());
let minuteTickInterval: number | null = null;
let stopAccentWatch: (() => void) | null = null;
const dailyTotals = computed(() => {
  const totals = new Map<string, number>();
  practiceStore.sessions.forEach((session) => {
    const key = getSessionLocalDate(session);
    totals.set(key, (totals.get(key) ?? 0) + session.totalTimeSpentSeconds);
  });
  return totals;
});
const currentStreak = computed(() =>
  computeCurrentStreak(dailyTotals.value, new Date()),
);
const longestStreak = computed(() => computeLongestStreak(dailyTotals.value));
const weeklyCount = computed(() =>
  computeCurrentWeekStreak(dailyTotals.value, new Date()),
);
const weeklyGoalLabel = computed(
  () => `${weeklyCount.value} / ${appStore.weeklyStreakGoalDays} days`,
);
const totalTodayMinutes = computed(() => {
  const todayKey = toLocalDateKey(new Date(nowTick.value));
  const totalSeconds = practiceStore.sessions.reduce((sum, session) => {
    if (getSessionLocalDate(session) !== todayKey) {
      return sum;
    }
    return sum + session.totalTimeSpentSeconds;
  }, 0);
  return normalizeDisplayMinutes(totalSeconds);
});

function isNavLocked(target: string): boolean {
  return isTimerLocked.value && route.path !== target;
}

/**
 * Pages that should NOT keep a tab loaded behind them.
 *
 * Stats: the right-pane PlayerPanel is hidden in favour of the
 *   stats detail target (#stats-detail-target). When the user
 *   navigates back to /library or /practice the PlayerPanel
 *   re-mounts and tries to render against AlphaTab state that's
 *   gone stale during the unmount → broken layout that Marcel
 *   reported.
 *
 * Settings: same shape — Marcel asked for the unload there too.
 *
 * Library / Practice / Metronome: keep the tab loaded; the
 *   PlayerPanel is the whole point of those pages and unloading
 *   on every nav-back-and-forth would force re-decode each time.
 */
const TAB_UNLOAD_ROUTES = new Set(['/stats', '/settings']);

watch(
  () => route.path,
  (path) => {
    if (!TAB_UNLOAD_ROUTES.has(path)) return;
    if (!playerStore.model.currentLibraryItemId) return;
    // Fire-and-forget: clearSelection is async (it awaits a tick
    // for the feedback-persistence watcher in PlayerPanel) but
    // the route transition is over by then anyway. Errors here
    // would be observable through an audio-engine fault, not the
    // navigation itself.
    void playerStore.clearSelection();
  },
);

function handleNavClick(event: MouseEvent, target: string): void {
  if (isNavLocked(target)) {
    event.preventDefault();
    event.stopPropagation();
  }
}

onMounted(() => {
  const applyAccent = (value: string) => {
    document.documentElement.style.setProperty('--accent', value);
    document.body.style.setProperty('--accent', value);
  };
  applyAccent(appStore.accentColor);
  stopAccentWatch = watch(
    () => appStore.accentColor,
    (value) => {
      applyAccent(value);
    },
    { immediate: false },
  );
  uiStore.initPlayerPanel();
  minuteTickInterval = window.setInterval(() => {
    nowTick.value = Date.now();
  }, 60000);
});

onUnmounted(() => {
  if (minuteTickInterval !== null) {
    window.clearInterval(minuteTickInterval);
    minuteTickInterval = null;
  }
  if (stopAccentWatch) {
    stopAccentWatch();
    stopAccentWatch = null;
  }
});

const navItems = [
  { label: 'Practice', to: '/practice', icon: IconMenuGuitar },
  { label: 'Library', to: '/library', icon: BookOpen },
  { label: 'Metronome', to: '/metronome', icon: IconMenuMetronome },
  { label: 'Stats', to: '/stats', icon: FileText },
  { label: 'Settings', to: '/settings', icon: Settings },
];
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <div
      class="app-shell"
      :style="accentStyle"
    >
      <section class="left-pane">
        <header class="top-nav">
          <NavigationMenuRoot class="nav-root">
            <NavigationMenuList class="nav-list">
              <NavigationMenuItem
                v-for="item in navItems"
                :key="item.to"
                class="nav-item-wrapper"
              >
                <AppTooltip :text="item.label">
                  <NavigationMenuLink as-child>
                    <RouterLink
                      class="nav-item"
                      :class="{ locked: isNavLocked(item.to) }"
                      :to="item.to"
                      :aria-label="item.label"
                      :aria-disabled="isNavLocked(item.to)"
                      :tabindex="isNavLocked(item.to) ? -1 : 0"
                      @click="handleNavClick($event, item.to)"
                    >
                      <component
                        :is="item.icon"
                        :size="26"
                        aria-hidden="true"
                      />
                    </RouterLink>
                  </NavigationMenuLink>
                </AppTooltip>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenuRoot>
        </header>
        <main class="main-content">
          <slot />
        </main>
      </section>
      <aside
        class="player-pane"
        :class="{
          'player-pane--stats': route.path === '/stats',
        }"
      >
        <PlayerPanel v-if="route.path !== '/stats'" />
        <div id="stats-detail-target" />
        <BeatmapEditorPanel
          v-if="showBeatmapPanel"
          :item-id="beatmapStore.editorItemId"
        />
        <SongMapEditorPanel
          v-if="showSongMapPanel"
          :item-id="songMapStore.editorItemId"
        />
      </aside>
      <footer
        v-show="!showOverlayPanel"
        class="bottom-panel"
      >
        <AppTooltip
          :text="`longest streak: ${longestStreak}`"
          side="top"
        >
          <div class="bottom-item">
            <span class="bottom-value">
              <Flame
                class="bottom-icon"
                :size="18"
                aria-hidden="true"
              />
              {{ formatStreakDays(currentStreak) }}
            </span>
          </div>
        </AppTooltip>
        <AppTooltip
          text="Total time practiced Today"
          side="top"
        >
          <div class="bottom-item">
            <span class="bottom-value">{{ totalTodayMinutes }}m</span>
          </div>
        </AppTooltip>
        <AppTooltip
          text="Your Weekly Streak Goal"
          side="top"
        >
          <div class="bottom-item">
            <span class="bottom-value">{{ weeklyGoalLabel }}</span>
          </div>
        </AppTooltip>
      </footer>
    </div>
    <div class="app-overlays" />
  </TooltipProvider>
</template>

<style scoped>
.app-shell {
  height: 100dvh;
  background: var(--bg);
  color: var(--text);
  display: grid;
  grid-template-columns: minmax(0, min(560px, 33.333vw)) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr) auto;
  overflow: hidden;
}

.left-pane {
  grid-row: 1;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  border-right: 1px solid var(--border);
  min-width: 0;
  min-height: 0;
}

.top-nav {
  padding: 24px clamp(20px, 4vw, 40px);
  border-bottom: 1px solid var(--border);
  background: var(--panel);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.nav-root {
  display: flex;
  align-items: center;
  width: 100%;
}

.nav-list {
  display: flex !important;
  flex-direction: row !important;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0 12px;
  margin: 0;
  list-style: none;
  gap: 0;
}

.nav-item-wrapper {
  flex: 1 1 0;
  display: flex;
  justify-content: center;
}

.nav-item {
  width: 100%;
  padding: 14px 0;
  color: var(--text-muted);
  text-decoration: none;
  border-bottom: 2px solid transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition:
    border-color 0.2s ease,
    color 0.2s ease;
}

.nav-item.locked {
  opacity: 0.4;
  pointer-events: none;
}

.nav-item :deep(svg) {
  width: 30px;
  height: 30px;
}

.nav-item:hover {
  color: var(--text);
  border-bottom-color: rgba(93, 214, 162, 0.45);
}

.nav-item.router-link-active {
  border-color: var(--accent);
  color: var(--text-active);
}

.nav-item:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
}

.main-content {
  flex: 1;
  /* Symmetric horizontal padding so per-page content stays centered
     in the left panel. The previous asymmetric `8px` right /
     `clamp(...)` left shifted everything visibly to the right and
     forced each page to monkey-patch padding-right via `:has()`
     overrides — half of which were missing (Stats, etc.). */
  padding: 28px clamp(20px, 4vw, 40px);
  display: flex;
  flex-direction: column;
  gap: 24px;
  overflow: auto;
  min-height: 0;
  /* Reserve scrollbar space on BOTH sides so content stays centered
     whether or not the scrollbar is visible. Same pattern Settings
     and Metronome already use; baseline-applying it makes every
     page consistent. */
  scrollbar-gutter: stable both-edges;
}

.player-pane {
  position: relative;
  grid-row: 1 / 3;
  background: #1b1b1f;
  padding: 28px clamp(20px, 4vw, 40px);
  min-width: 0;
  overflow: auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.player-pane--stats {
  background: var(--bg);
  border-left: 1px solid var(--border);
}

.bottom-panel {
  grid-column: 1;
  grid-row: 2;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  padding: 10px clamp(20px, 4vw, 40px);
  border-top: 1px solid var(--border);
  background: var(--panel);
  position: sticky;
  bottom: 0;
  z-index: 20;
}

.bottom-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-align: center;
}

.bottom-value {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.app-overlays {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 100000;
}

.app-overlays :deep(*) {
  pointer-events: auto;
}

.bottom-icon {
  color: var(--accent);
}

@media (max-width: 1100px) {
  .app-shell {
    grid-template-columns: 1fr;
  }

  .player-pane {
    order: -1;
    grid-row: 1;
    border-bottom: 1px solid var(--border);
  }

  .left-pane {
    border-right: none;
  }
}
</style>
