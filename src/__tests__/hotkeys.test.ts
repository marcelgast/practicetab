// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  isTypingTarget,
  getPlayerHotkeyAction,
  shouldHandleSpacebar,
  shouldHandlePlayerHotkey,
} from '../services/hotkeys';

describe('hotkeys helpers', () => {
  it('detects typing targets', () => {
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');

    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(textarea)).toBe(true);
    expect(isTypingTarget(div)).toBe(true);
  });

  it('allows spacebar when not typing', () => {
    const input = document.createElement('input');
    const target = document.createElement('div');
    expect(shouldHandleSpacebar(input)).toBe(false);
    expect(shouldHandleSpacebar(target)).toBe(true);
  });

  it('skips player hotkeys only when typing', () => {
    const input = document.createElement('input');
    const target = document.createElement('div');
    expect(shouldHandlePlayerHotkey(input)).toBe(false);
    expect(shouldHandlePlayerHotkey(target)).toBe(true);
  });

  it('maps key codes to player hotkey actions', () => {
    const target = document.createElement('div');
    const space = new KeyboardEvent('keydown', { code: 'Space' });
    Object.defineProperty(space, 'target', { value: target });
    const spaceKey = new KeyboardEvent('keydown', { key: ' ' });
    Object.defineProperty(spaceKey, 'target', { value: target });
    const stop = new KeyboardEvent('keydown', { code: 'KeyS' });
    Object.defineProperty(stop, 'target', { value: target });
    const esc = new KeyboardEvent('keydown', { code: 'Escape' });
    Object.defineProperty(esc, 'target', { value: target });
    const other = new KeyboardEvent('keydown', { code: 'KeyA' });
    Object.defineProperty(other, 'target', { value: target });

    expect(getPlayerHotkeyAction(space)).toBe('toggle');
    expect(getPlayerHotkeyAction(spaceKey)).toBe('toggle');
    expect(getPlayerHotkeyAction(stop)).toBe('stop');
    expect(getPlayerHotkeyAction(esc)).toBe('stop');
    expect(getPlayerHotkeyAction(other)).toBeNull();
  });

  it('maps L to listen action', () => {
    const target = document.createElement('div');
    const listen = new KeyboardEvent('keydown', { code: 'KeyL' });
    Object.defineProperty(listen, 'target', { value: target });

    expect(getPlayerHotkeyAction(listen)).toBe('listen');
  });
});
