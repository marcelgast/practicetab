export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    return true;
  }
  return target.isContentEditable;
}

export function shouldHandleSpacebar(target: EventTarget | null): boolean {
  return shouldHandlePlayerHotkey(target);
}

export function shouldHandlePlayerHotkey(target: EventTarget | null): boolean {
  if (isTypingTarget(target)) return false;
  // Don't handle player hotkeys when Song Map Editor modal is open
  if (document.querySelector('.songmap-editor-overlay')) return false;
  return true;
}

export type PlayerHotkeyAction = 'toggle' | 'stop' | 'listen' | 'timer' | null;

export function getPlayerHotkeyAction(
  event: KeyboardEvent,
): PlayerHotkeyAction {
  if (!shouldHandlePlayerHotkey(event.target)) {
    return null;
  }
  if (
    event.code === 'Space' ||
    event.code === 'Spacebar' ||
    event.key === ' ' ||
    event.key === 'Spacebar'
  ) {
    return 'toggle';
  }
  if (event.code === 'KeyS' || event.code === 'Escape') {
    return 'stop';
  }
  if (event.code === 'KeyL') {
    return 'listen';
  }
  if (event.code === 'KeyT') {
    return 'timer';
  }
  return null;
}
