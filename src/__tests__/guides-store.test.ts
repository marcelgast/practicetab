import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useGuideStore } from '../stores/guides';
import { useAppStore } from '../stores/app';
import { GUIDE_LIST } from '../domain/guides/registry';

describe('useGuideStore', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('exposes guides in registry order', () => {
    const guideStore = useGuideStore();
    expect(guideStore.guides.map((g) => g.id)).toEqual(
      GUIDE_LIST.map((g) => g.id),
    );
  });

  it('defaults fresh installs to shouldShowWelcome = true', () => {
    const guideStore = useGuideStore();
    expect(guideStore.showAtStartup).toBe(true);
    expect(guideStore.dismissedThisSession).toBe(false);
    expect(guideStore.shouldShowWelcome).toBe(true);
  });

  it('hides Welcome for this session after dismissWelcomeForSession', () => {
    const guideStore = useGuideStore();
    guideStore.dismissWelcomeForSession();
    expect(guideStore.dismissedThisSession).toBe(true);
    expect(guideStore.shouldShowWelcome).toBe(false);
    // But the persistent toggle stays on, so a fresh store (new
    // session) would show it again.
    expect(guideStore.showAtStartup).toBe(true);
  });

  it('tracks completion per guide', () => {
    const guideStore = useGuideStore();
    expect(guideStore.isCompleted('practice')).toBe(false);
    guideStore.markCompleted('practice');
    expect(guideStore.isCompleted('practice')).toBe(true);
    expect(guideStore.completedAt('practice')).not.toBeNull();
    expect(guideStore.isCompleted('library')).toBe(false);
  });

  it('resetCompleted clears a single guide only', () => {
    const guideStore = useGuideStore();
    guideStore.markCompleted('practice');
    guideStore.markCompleted('library');
    guideStore.resetCompleted('practice');
    expect(guideStore.isCompleted('practice')).toBe(false);
    expect(guideStore.isCompleted('library')).toBe(true);
  });

  it('hides Welcome once every guide is completed, even with toggle on', () => {
    const guideStore = useGuideStore();
    GUIDE_LIST.forEach((g) => guideStore.markCompleted(g.id));
    expect(guideStore.allCompleted).toBe(true);
    expect(guideStore.shouldShowWelcome).toBe(false);
  });

  it('setShowAtStartup flips the underlying app-store flag', () => {
    const appStore = useAppStore();
    const guideStore = useGuideStore();
    guideStore.setShowAtStartup(false);
    expect(appStore.guideState.showAtStartup).toBe(false);
    expect(guideStore.showAtStartup).toBe(false);
    expect(guideStore.shouldShowWelcome).toBe(false);
  });

  it('markGuideIntendedThisSession sets a session-only flag', () => {
    const guideStore = useGuideStore();
    expect(guideStore.guideIntendedThisSession).toBe(false);
    guideStore.markGuideIntendedThisSession();
    expect(guideStore.guideIntendedThisSession).toBe(true);
  });
});
