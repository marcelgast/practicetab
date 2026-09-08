import { createRouter, createWebHistory } from 'vue-router';
import LibraryPage from '../pages/Library.vue';
import PlayerPage from '../pages/Player.vue';
import MetronomePage from '../pages/Metronome.vue';
import PracticePage from '../pages/Practice.vue';
import StatsPage from '../pages/Stats.vue';
import SettingsPage from '../pages/Settings.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/practice' },
    { path: '/library', name: 'Library', component: LibraryPage },
    { path: '/player', name: 'Player', component: PlayerPage },
    { path: '/metronome', name: 'Metronome', component: MetronomePage },
    { path: '/practice', name: 'Practice', component: PracticePage },
    { path: '/stats', name: 'Stats', component: StatsPage },
    { path: '/settings', name: 'Settings', component: SettingsPage },
  ],
  scrollBehavior() {
    return { top: 0, left: 0 };
  },
});
